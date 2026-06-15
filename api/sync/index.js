import { createServiceClient, getUser } from '../lib/supabase.js';

const API = 'https://api.tcgdex.net/v2/en';
const BATCH = 20;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000); // 7 s per attempt
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(800 * attempt);
    }
  }
  // Surface the root cause (Node 18 native fetch wraps it in err.cause)
  const cause = lastErr?.cause;
  const detail = cause?.message ?? cause?.code ?? lastErr?.message ?? 'fetch failed';
  throw new Error(`fetch failed after ${retries} attempts: ${detail}`);
}

async function fetchBatch(urls) {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetchWithRetry(url, 2);
        return res.ok ? res.json() : null;
      } catch { return null; }
    })
  );
}

async function requireAdminUser(req, res) {
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
  const supabase = createServiceClient();

  // ── Vercel cron authentication ─────────────────────────────────────────────
  // Vercel cron jobs make GET requests with Authorization: Bearer <CRON_SECRET>.
  // This check must happen before the GET/POST split so the cron GET bypasses
  // the admin-only status endpoint and falls through to the sync logic.
  const authHeader = req.headers['authorization'];
  const cronEnvSecret = process.env.CRON_SECRET;
  const isScheduledRun = !!(cronEnvSecret && authHeader === `Bearer ${cronEnvSecret}`);

  // ── GET (non-cron): return sync status & schedule config for the admin UI ──
  if (req.method === 'GET' && !isScheduledRun) {
    const ok = await requireAdminUser(req, res);
    if (!ok) return;

    const { data: rows } = await supabase.from('sync_meta').select('key, value');
    const meta = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));

    return res.json({
      lastSync:          meta.last_sync           ?? null,
      lastSyncType:      meta.last_sync_type       ?? 'manual',
      lastPriceSync:     meta.last_price_sync      ?? null,
      lastPriceSyncType: meta.last_price_sync_type ?? 'manual',
      scheduleType:      meta.schedule_type        ?? 'monthly',
      scheduleDay:       parseInt(meta.schedule_day ?? '1', 10),
    });
  }

  // Reject anything that isn't a cron GET or a manual POST
  if (!isScheduledRun && req.method !== 'POST') return res.status(405).end();

  // phase=sets     → sync sets list + collect all card IDs, store pending IDs in sync_meta
  // phase=cards    → fetch next batch of pending card IDs from sync_meta, upsert, advance cursor
  // phase=prices   → fetch next batch of ALL card IDs and update pricing columns only
  // phase=auto     → run sets phase then card batch (default for cron and manual)
  // phase=schedule → save schedule config (scheduleType, scheduleDay)
  const phase = req.query.phase ?? 'auto';

  if (isScheduledRun) {
    // Prices cron (phase=prices) always runs — the cron schedule controls the cadence.
    // Auto/sets/cards cron checks the user-configured schedule day before running.
    if (phase !== 'prices') {
      const { data: schedRows } = await supabase.from('sync_meta').select('key, value')
        .in('key', ['schedule_type', 'schedule_day']);
      const schedMeta = Object.fromEntries((schedRows ?? []).map((r) => [r.key, r.value]));
      const scheduleType = schedMeta.schedule_type ?? 'monthly';
      const scheduleDay  = parseInt(schedMeta.schedule_day ?? '1', 10);

      const now = new Date();
      let shouldRun = false;
      if (scheduleType === 'weekly')       shouldRun = now.getUTCDay()  === scheduleDay;
      else if (scheduleType === 'monthly') shouldRun = now.getUTCDate() === scheduleDay;
      // 'manual_only' → never auto-run

      if (!shouldRun) {
        res.setHeader('Content-Type', 'text/plain');
        res.write('Scheduled check — not sync day. Skipping.\n');
        return res.end();
      }
    }
  } else {
    // Manual POST: require a logged-in admin user
    const ok = await requireAdminUser(req, res);
    if (!ok) return;
  }
  const CARD_BATCH_SIZE = 1000; // cards per invocation

  // ── Schedule config save ─────────────────────────────────────────────────
  if (phase === 'schedule') {
    const { scheduleType, scheduleDay } = req.body ?? {};
    await supabase.from('sync_meta').upsert([
      { key: 'schedule_type', value: scheduleType ?? 'monthly' },
      { key: 'schedule_day',  value: String(scheduleDay ?? 1)  },
    ], { onConflict: 'key' });
    return res.json({ ok: true });
  }

  res.setHeader('Content-Type', 'text/plain');
  const log = (msg) => { console.log('[sync]', msg); try { res.write(msg + '\n'); } catch {} };

  try {
    if (phase === 'sets' || phase === 'auto') {
      log('Fetching sets list…');
      const setsRes = await fetchWithRetry(`${API}/sets`);
      if (!setsRes.ok) throw new Error(`Sets fetch failed: ${setsRes.status}`);
      const sets = await setsRes.json();

      // Fetch existing set images from DB so we never overwrite custom ones
      const existingImages = {};
      {
        let from = 0;
        while (true) {
          const { data: page } = await supabase.from('sets').select('id, logo_image, symbol_image').range(from, from + 999);
          if (!page || page.length === 0) break;
          page.forEach((s) => { existingImages[s.id] = s; });
          if (page.length < 1000) break;
          from += 1000;
        }
      }

      // Upsert basic set info — never overwrite a field that already has a value in the DB
      for (let i = 0; i < sets.length; i += BATCH) {
        const rows = sets.slice(i, i + BATCH).map((s) => {
          const existing = existingImages[s.id] ?? {};
          // Always include logo/symbol columns so every row in the batch has the same
          // shape. If some rows omit a column, PostgREST normalises the missing fields
          // to NULL in the ON CONFLICT DO UPDATE, which would clear any existing value.
          // Prefer the DB value (custom or previously synced); fall back to the API value.
          return {
            id: s.id,
            name: s.name,
            total: s.cardCount?.total ?? null,
            printed_total: s.cardCount?.official ?? null,
            logo_image:   existing.logo_image   || (s.logo   ? `${s.logo}.webp`   : null),
            symbol_image: existing.symbol_image || (s.symbol ? `${s.symbol}.webp` : null),
          };
        });
        const { error } = await supabase.from('sets').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Sets upsert: ${error.message}`);
      }
      log(`Upserted ${sets.length} sets. Fetching set details…`);

      // Fetch ALL existing card IDs and image status — paginate because Supabase caps at 1000 rows per request
      const existingIds = new Set();
      const imagelessIds = new Set(); // cards in DB but missing small_image
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page } = await supabase.from('cards').select('id, small_image').range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        page.forEach((c) => {
          existingIds.add(c.id);
          if (!c.small_image) imagelessIds.add(c.id);
        });
        if (page.length < PAGE) break;
        from += PAGE;
      }
      log(`Found ${existingIds.size} cards already in DB (${imagelessIds.size} missing images).`);
      const initialExistingCount = existingIds.size;
      const initialImagelessCount = imagelessIds.size;

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
            // Only set image fields if the DB doesn't already have a custom value
            ...(detail.symbol && !existingImages[detail.id]?.symbol_image ? { symbol_image: `${detail.symbol}.webp` } : {}),
            ...(detail.logo   && !existingImages[detail.id]?.logo_image   ? { logo_image:   `${detail.logo}.webp`   } : {}),
          }).eq('id', detail.id);
          if (detail.cards) {
            const newCards = detail.cards.filter((c) => !existingIds.has(c.id));
            if (newCards.length > 0) {
              // Insert minimal stub rows immediately so that cards which fail the
              // individual fetch (TCGdex data gaps) are still recorded in the DB
              // and won't be re-queued on every subsequent sync.
              // Include image URLs from the set listing where available so stubs
              // don't stay imageless if the individual card fetch fails later.
              const stubs = newCards.map((c) => ({
                id: c.id,
                set_id: detail.id,
                name: c.name ?? null,
                number: c.localId ?? null,
                ...(c.image ? {
                  small_image: `${c.image}/low.webp`,
                  large_image: `${c.image}/high.webp`,
                } : {}),
              }));
              await supabase.from('cards').upsert(stubs, { onConflict: 'id', ignoreDuplicates: true });
              newCards.forEach((c) => {
                existingIds.add(c.id); // prevent duplicate queuing within this run
                pendingCardIds.push(c.id);
              });
            }

            // Re-queue existing cards that are missing images so they get a fresh
            // individual-fetch attempt (handles cards synced before TCGdex had images).
            // Also patch the image from the set listing if it's already available there.
            const imagelessInSet = detail.cards.filter((c) => imagelessIds.has(c.id));
            if (imagelessInSet.length > 0) {
              // Patch stubs with set-listing images where available
              const withSetImage = imagelessInSet.filter((c) => c.image);
              if (withSetImage.length > 0) {
                const patches = withSetImage.map((c) => ({
                  id: c.id,
                  small_image: `${c.image}/low.webp`,
                  large_image: `${c.image}/high.webp`,
                }));
                await supabase.from('cards').upsert(patches, { onConflict: 'id', ignoreDuplicates: false });
              }
              // Queue all imageless cards for a fresh individual fetch regardless
              imagelessInSet.forEach((c) => {
                pendingCardIds.push(c.id);
                imagelessIds.delete(c.id); // prevent duplicate queuing across sets
              });
            }
          }
        }
        await sleep(80);
      }

      const requeuedImagelessCount = initialImagelessCount - imagelessIds.size;
      const newCardsQueuedCount = pendingCardIds.length - requeuedImagelessCount;
      log(`${initialExistingCount} cards in DB initially, ${initialImagelessCount} without images, ${newCardsQueuedCount} new cards queued, ${requeuedImagelessCount} imageless cards re-queued.`);

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
        // Still record the run timestamp so the admin UI reflects the last check
        if (isScheduledRun) {
          await supabase.from('sync_meta').upsert([
            { key: 'last_sync',      value: new Date().toISOString() },
            { key: 'last_sync_type', value: 'scheduled' },
          ], { onConflict: 'key' });
        }
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
          { key: 'card_cursor',      value: '0' },
          { key: 'last_sync',        value: new Date().toISOString() },
          { key: 'last_sync_type',   value: isScheduledRun ? 'scheduled' : 'manual' },
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
    // Prices phase — fetch pricing for all cards in batches, update price columns only
    // Also runs automatically on every scheduled cron (one cursor-batch per run keeps prices rotating)
    if (phase === 'prices' || (isScheduledRun && phase === 'auto')) {
      // Load cursor from sync_meta
      const { data: metaRows } = await supabase
        .from('sync_meta')
        .select('key, value')
        .in('key', ['price_cursor']);
      const meta = Object.fromEntries((metaRows ?? []).map((r) => [r.key, r.value]));
      const cursor = parseInt(meta.price_cursor ?? '0', 10);

      // Paginate all card IDs from DB
      const allIds = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page } = await supabase.from('cards').select('id').range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        page.forEach((c) => allIds.push(c.id));
        if (page.length < PAGE) break;
        from += PAGE;
      }

      if (allIds.length === 0) {
        log('No cards in DB — run a card sync first.');
        return res.end();
      }

      const slice = allIds.slice(cursor, cursor + CARD_BATCH_SIZE);
      log(`Syncing prices for cards ${cursor + 1}–${cursor + slice.length} of ${allIds.length}…`);

      for (let i = 0; i < slice.length; i += BATCH) {
        const batch = slice.slice(i, i + BATCH);
        const cards = await fetchBatch(batch.map((id) => `${API}/cards/${id}`));
        const rows = cards.filter(Boolean).map((card) => {
          const cm = card.pricing?.cardmarket;
          const tcp = card.pricing?.tcgplayer;
          return {
            id: card.id,
            ...(cm ? {
              cm_trend: cm.trend ?? null,
              cm_avg30: cm.avg30 ?? null,
              cm_low: cm.low ?? null,
              cm_trend_holo: cm['trend-holo'] ?? null,
              cm_avg30_holo: cm['avg30-holo'] ?? null,
            } : {}),
            ...(tcp ? {
              tcp_normal_market: tcp.normal?.marketPrice ?? null,
              tcp_normal_low: tcp.normal?.lowPrice ?? null,
              tcp_reverse_market: tcp.reverse?.marketPrice ?? null,
            } : {}),
            price_updated_at: new Date().toISOString(),
          };
        }).filter((r) => Object.keys(r).length > 1); // skip cards with no pricing data

        if (rows.length) {
          const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' });
          if (error) throw new Error(`Prices upsert: ${error.message}`);
        }
        await sleep(80);
      }

      const newCursor = cursor + slice.length;
      const remaining = allIds.length - newCursor;

      if (remaining <= 0) {
        await supabase.from('sync_meta').upsert([
          { key: 'price_cursor',          value: '0' },
          { key: 'last_price_sync',       value: new Date().toISOString() },
          { key: 'last_price_sync_type',  value: isScheduledRun ? 'scheduled' : 'manual' },
        ], { onConflict: 'key' });
        log(`Price sync complete! Updated prices for ${allIds.length} cards.`);
      } else {
        await supabase.from('sync_meta').upsert(
          { key: 'price_cursor', value: String(newCursor) },
          { onConflict: 'key' }
        );
        log(`Batch complete. ${remaining} cards remaining — click "Continue Prices" to sync next batch.`);
      }

      return res.end();
    }

  } catch (err) {
    const cause = err?.cause;
    const detail = cause?.message ?? cause?.code ?? err.message ?? 'unknown error';
    log(`Error: ${detail}`);
    res.end();
  }
}

