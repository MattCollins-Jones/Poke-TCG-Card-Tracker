import { createServiceClient, requireUser } from '../lib/supabase.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Accept either a logged-in user OR the cron secret header
  const cronSecret = req.headers['x-sync-secret'];
  const isCron = cronSecret && cronSecret === process.env.SYNC_SECRET;
  if (!isCron) {
    const user = await requireUser(req, res);
    if (!user) return; // requireUser already sent 401
  }

  // Acknowledge immediately — Vercel functions have a 30s timeout so we stream progress
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');
  const log = (msg) => { console.log('[sync]', msg); try { res.write(msg + '\n'); } catch {} };

  const supabase = createServiceClient();

  try {
    log('Fetching sets list…');
    const setsRes = await fetch(`${API}/sets`);
    if (!setsRes.ok) throw new Error(`Sets fetch failed: ${setsRes.status}`);
    const sets = await setsRes.json();

    // Upsert sets
    for (let i = 0; i < sets.length; i += BATCH) {
      const batch = sets.slice(i, i + BATCH);
      const rows = batch.map((s) => ({
        id: s.id,
        name: s.name,
        total: s.cardCount?.official ?? null,
        symbol_image: s.symbol ? `${s.symbol}.webp` : null,
        logo_image: s.logo ? `${s.logo}.webp` : null,
      }));
      const { error } = await supabase.from('sets').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Sets upsert: ${error.message}`);
    }
    log(`Upserted ${sets.length} sets. Fetching set details…`);

    // Fetch set details for serie + releaseDate + card IDs
    const allCardIds = [];
    for (let i = 0; i < sets.length; i += BATCH) {
      const batch = sets.slice(i, i + BATCH);
      const details = await fetchBatch(batch.map((s) => `${API}/sets/${s.id}`));
      for (const detail of details) {
        if (!detail) continue;
        await supabase.from('sets').update({
          series: detail.serie?.name ?? null,
          release_date: detail.releaseDate ?? null,
          symbol_image: detail.symbol ? `${detail.symbol}.webp` : null,
          logo_image: detail.logo ? `${detail.logo}.webp` : null,
        }).eq('id', detail.id);
        if (detail.cards) detail.cards.forEach((c) => allCardIds.push(c.id));
      }
      log(`Set details: ${Math.min(i + BATCH, sets.length)}/${sets.length}…`);
      await sleep(100);
    }

    log(`Found ${allCardIds.length} cards. Fetching card details…`);

    // Fetch + upsert cards
    let done = 0;
    for (let i = 0; i < allCardIds.length; i += BATCH) {
      const batch = allCardIds.slice(i, i + BATCH);
      const cards = await fetchBatch(batch.map((id) => `${API}/cards/${id}`));
      const rows = cards.filter(Boolean).map((card) => {
        const subtypes = [];
        if (card.stage) subtypes.push(card.stage);
        return {
          id: card.id,
          set_id: card.set?.id ?? card.id.split('-')[0],
          name: card.name,
          number: card.localId ?? null,
          rarity: card.rarity ?? null,
          subtypes: subtypes.length ? subtypes : null,
          variants: card.variants ?? null,
          small_image: card.image ? `${card.image}/low.webp` : null,
          large_image: card.image ? `${card.image}/high.webp` : null,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Cards upsert: ${error.message}`);
      }
      done += batch.length;
      if (done % 2000 === 0) log(`Cards: ${done}/${allCardIds.length}…`);
      await sleep(100);
    }

    await supabase.from('sync_meta').upsert({ key: 'last_sync', value: new Date().toISOString() }, { onConflict: 'key' });
    log(`Sync complete: ${sets.length} sets, ${done} cards.`);
    res.end();
  } catch (err) {
    log(`Error: ${err.message}`);
    res.end();
  }
}
