import { createServiceClient, getUser } from '../lib/supabase.js';

const API = 'https://api.tcgdex.net/v2/en';
const BATCH = 20;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchBatch(urls) {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        return res.ok ? res.json() : null;
      } catch { return null; }
    })
  );
}

async function requireAdmin(req, res) {
  // Allow cron jobs via secret header
  const cronSecret = req.headers['x-sync-secret'];
  if (cronSecret && cronSecret === process.env.SYNC_SECRET) return true;

  // Otherwise require a logged-in admin user
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorised' }); return false; }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    res.status(403).json({ error: 'Forbidden — admin only' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const isAdmin = await requireAdmin(req, res);
  if (!isAdmin) return;

  // phase=sets  → sync sets list + collect all card IDs, store pending IDs in sync_meta
  // phase=cards → fetch next batch of pending card IDs from sync_meta, upsert, advance cursor
  // phase=auto  → run sets phase then as many card batches as time allows (default)
  const phase = req.query.phase ?? 'auto';
  const CARD_BATCH_SIZE = 200; // cards per invocation

  res.setHeader('Content-Type', 'text/plain');
  const log = (msg) => { console.log('[sync]', msg); try { res.write(msg + '\n'); } catch {} };

  const supabase = createServiceClient();

  try {
    if (phase === 'sets' || phase === 'auto') {
      log('Fetching sets list…');
      const setsRes = await fetch(`${API}/sets`);
      if (!setsRes.ok) throw new Error(`Sets fetch failed: ${setsRes.status}`);
      const sets = await setsRes.json();

      // Upsert basic set info
      for (let i = 0; i < sets.length; i += BATCH) {
        const rows = sets.slice(i, i + BATCH).map((s) => ({
          id: s.id,
          name: s.name,
          total: s.cardCount?.total ?? null,
          printed_total: s.cardCount?.official ?? null,
          symbol_image: s.symbol ? `${s.symbol}.webp` : null,
          logo_image: s.logo ? `${s.logo}.webp` : null,
        }));
        const { error } = await supabase.from('sets').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Sets upsert: ${error.message}`);
      }
      log(`Upserted ${sets.length} sets. Fetching set details…`);

      // Fetch set details + collect card IDs not already in DB
      const { data: existingCards } = await supabase.from('cards').select('id');
      const existingIds = new Set((existingCards ?? []).map((c) => c.id));

      const pendingCardIds = [];
      for (let i = 0; i < sets.length; i += BATCH) {
        const batch = sets.slice(i, i + BATCH);
        const details = await fetchBatch(batch.map((s) => `${API}/sets/${s.id}`));
        for (const detail of details) {
          if (!detail) continue;
          await supabase.from('sets').update({
            series: detail.serie?.name ?? null,
            release_date: detail.releaseDate ?? null,
            total: detail.cardCount?.total ?? detail.cards?.length ?? null,
            printed_total: detail.cardCount?.official ?? null,
            symbol_image: detail.symbol ? `${detail.symbol}.webp` : null,
            logo_image: detail.logo ? `${detail.logo}.webp` : null,
          }).eq('id', detail.id);
          if (detail.cards) {
            detail.cards
              .filter((c) => !existingIds.has(c.id))
              .forEach((c) => pendingCardIds.push(c.id));
          }
        }
        await sleep(80);
      }

      log(`${pendingCardIds.length} new cards to sync (${existingIds.size} already in DB).`);

      // Store pending IDs and reset cursor
      await supabase.from('sync_meta').upsert([
        { key: 'pending_card_ids', value: JSON.stringify(pendingCardIds) },
        { key: 'card_cursor', value: '0' },
      ], { onConflict: 'key' });

      if (phase === 'sets') {
        log('Sets phase complete. Run phase=cards to sync new cards.');
        return res.end();
      }
    }

    // Cards phase — fetch next CARD_BATCH_SIZE pending cards
    if (phase === 'cards' || phase === 'auto') {
      const { data: metaRows } = await supabase
        .from('sync_meta')
        .select('key, value')
        .in('key', ['pending_card_ids', 'card_cursor']);

      const meta = Object.fromEntries((metaRows ?? []).map((r) => [r.key, r.value]));
      const pendingCardIds = JSON.parse(meta.pending_card_ids ?? '[]');
      const cursor = parseInt(meta.card_cursor ?? '0', 10);

      if (pendingCardIds.length === 0) {
        log('No pending cards — already up to date!');
        return res.end();
      }

      const slice = pendingCardIds.slice(cursor, cursor + CARD_BATCH_SIZE);
      log(`Syncing cards ${cursor + 1}–${cursor + slice.length} of ${pendingCardIds.length}…`);

      for (let i = 0; i < slice.length; i += BATCH) {
        const batch = slice.slice(i, i + BATCH);
        const cards = await fetchBatch(batch.map((id) => `${API}/cards/${id}`));
        const rows = cards.filter(Boolean).map((card) => ({
          id: card.id,
          set_id: card.set?.id ?? card.id.split('-')[0],
          name: card.name,
          number: card.localId ?? null,
          rarity: card.rarity ?? null,
          subtypes: card.stage ? [card.stage] : null,
          variants: card.variants ?? null,
          small_image: card.image ? `${card.image}/low.webp` : null,
          large_image: card.image ? `${card.image}/high.webp` : null,
        }));
        if (rows.length) {
          const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
          if (error) throw new Error(`Cards upsert: ${error.message}`);
        }
        await sleep(80);
      }

      const newCursor = cursor + slice.length;
      const remaining = pendingCardIds.length - newCursor;

      if (remaining <= 0) {
        // All done — clear pending list
        await supabase.from('sync_meta').upsert([
          { key: 'pending_card_ids', value: '[]' },
          { key: 'card_cursor', value: '0' },
          { key: 'last_sync', value: new Date().toISOString() },
        ], { onConflict: 'key' });
        log(`All cards synced! Total: ${pendingCardIds.length} cards processed.`);
      } else {
        await supabase.from('sync_meta').upsert(
          { key: 'card_cursor', value: String(newCursor) },
          { onConflict: 'key' }
        );
        log(`Batch complete. ${remaining} cards remaining — click "Continue" to sync next batch.`);
      }

      res.end();
    }
  } catch (err) {
    log(`Error: ${err.message}`);
    res.end();
  }
}

