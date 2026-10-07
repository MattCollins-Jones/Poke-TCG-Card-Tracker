import { createServiceClient, getUser } from '../_lib/supabase.js';

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

// ── Set image resolution ────────────────────────────────────────────────────
// TCGdex returns extension-less asset URLs (e.g. …/sv/sv01/logo) and the client
// appends a format. Two things have changed upstream:
//   1. Set symbols are published under assets.tcgdex.net/univ/… which now returns
//      "InvalidBucketName" for every set; the same path under /en/ still works.
//   2. Not every asset exists as .webp — a handful are only available as .png.
// So rewrite the host path and probe .webp then .png with HEAD requests.
const ASSET_HOST = 'assets.tcgdex.net';
const isTcgdexAsset = (url) => typeof url === 'string' && url.includes(ASSET_HOST);
// Only re-resolve URLs that we previously derived from TCGdex. Custom-uploaded
// images (Supabase storage etc.) are never touched.
const needsResolve = (url) => !url || isTcgdexAsset(url);

const HEAD_TIMEOUT_MS = 5000;
// Shared deadline for HEAD probes, set per request by the handler so a probe can
// never run past the invocation's time budget. 0 = no deadline (unit tests etc.).
let probeDeadline = 0;
async function headOk(url) {
  const remaining = probeDeadline ? probeDeadline - Date.now() : HEAD_TIMEOUT_MS;
  if (remaining <= 0) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(HEAD_TIMEOUT_MS, remaining));
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    return res.ok;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

// Request-scoped: reset at the start of every handler invocation. A module-level
// cache would survive on a warm instance and keep serving stale null/dead results,
// so later syncs would never discover newly published or removed artwork.
let assetCache = new Map();
async function resolveAssetUrl(base) {
  if (!base) return null;
  if (assetCache.has(base)) return assetCache.get(base);
  const fixed = base.replace(`${ASSET_HOST}/univ/`, `${ASSET_HOST}/en/`);
  let resolved = null;
  for (const ext of ['webp', 'png']) {
    if (await headOk(`${fixed}.${ext}`)) { resolved = `${fixed}.${ext}`; break; }
  }
  assetCache.set(base, resolved);
  return resolved;
}

// Pick the image to store during the regular sets phase. This must stay cheap
// (the CDN throttles HEAD probes — a full verification of every set takes ~30 s),
// so only brand-new sets are probed here. Known-broken /univ/ URLs are rewritten
// in place; phase=images does the thorough per-set verification.
async function pickImage(existing, apiBase) {
  if (!needsResolve(existing)) return existing;                       // custom upload — never touch
  if (existing) return existing.replace(`${ASSET_HOST}/univ/`, `${ASSET_HOST}/en/`);
  return (await resolveAssetUrl(apiBase)) ?? null;                     // new set — probe once
}

// Thorough version used by phase=images: re-probe TCGdex-hosted URLs so .webp→.png
// mismatches and dead assets get corrected. Falls back to the existing value when
// the probe fails outright, so a CDN blip never wipes an image we already had.
async function verifyImage(existing, apiBase) {
  if (!needsResolve(existing)) return existing;
  const base = apiBase ?? (existing ? existing.replace(/\.(webp|png)$/, '') : null);
  const resolved = await resolveAssetUrl(base);
  if (resolved) return resolved;
  // Nothing resolvable: only clear it when the stored URL is itself confirmed dead
  if (existing && !(await headOk(existing))) return null;
  return existing ?? null;
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
      lastSync:          meta.last_sync              ?? null,
      lastSyncType:      meta.last_sync_type          ?? 'manual',
      lastPriceSync:     meta.last_price_sync         ?? null,
      lastPriceSyncType: meta.last_price_sync_type    ?? 'manual',
      scheduleType:      meta.schedule_type           ?? 'monthly',
      scheduleDay:       parseInt(meta.schedule_day ?? '1', 10),
      lastCronAttempt:   meta.last_cron_attempt       ?? null,
      lastCronResult:    meta.last_cron_result        ?? null,
    });
  }

  // Reject anything that isn't a cron GET or a manual POST
  if (!isScheduledRun && req.method !== 'POST') return res.status(405).end();

  // phase=sets     → sync sets list + collect all card IDs, store pending IDs in sync_meta
  // phase=cards    → fetch next batch of pending card IDs from sync_meta, upsert, advance cursor
  // phase=prices   → fetch next batch of ALL card IDs and update pricing columns only
  // phase=auto     → run sets phase then card batch (default for cron and manual)
  // phase=images   → verify/repair every set logo & symbol URL against the TCGdex CDN (time-boxed, resumable)
  // phase=schedule → save schedule config (scheduleType, scheduleDay)
  const phase = req.query.phase ?? 'auto';

  // Vercel functions are capped at 60 s (vercel.json maxDuration). Each phase
  // checks this budget between batches and saves its cursor when time is short,
  // so the next invocation picks up where this one left off instead of the
  // function being killed mid-run with nothing recorded.
  const START_TIME = Date.now();
  const TIME_BUDGET_MS = 48_000;
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - START_TIME);
  const outOfTime = () => timeLeft() <= 0;
  // Worst case for one image-verification batch: two sequential ext probes plus a
  // dead-check on the stored URL (3 × HEAD_TIMEOUT_MS), then the DB write.
  const IMG_BATCH_WORST_MS = 3 * HEAD_TIMEOUT_MS + 1000;
  // Scheduled runs keep this much budget back from card draining so the daily
  // price batch isn't starved while a long pending queue is being worked off.
  const PRICE_RESERVE_MS = 15_000;
  probeDeadline = START_TIME + TIME_BUDGET_MS;
  assetCache = new Map();

  // Cron-only decision: should this run kick off a fresh sets+cards sync today?
  // (Separate from draining an existing queue, which happens every day.)
  let isSyncDay = false;
  let cronSkippedSets = false;

  if (isScheduledRun) {
    // Record every cron invocation so the admin UI can show whether Vercel is firing the cron at all.
    // Wrapped in try-catch so a transient Supabase error never prevents the actual sync from running.
    const cronAttemptTime = new Date().toISOString();
    try {
      await supabase.from('sync_meta').upsert(
        { key: 'last_cron_attempt', value: cronAttemptTime },
        { onConflict: 'key' }
      );
    } catch {}

    // The cron fires daily; the user-configured schedule decides which day a NEW
    // full sync starts. Other days still drain any cards left in the queue and
    // rotate a price batch, so a weekly schedule doesn't need the whole sync to
    // fit into one 60 s invocation.
    if (phase !== 'prices') {
      const { data: schedRows } = await supabase.from('sync_meta').select('key, value')
        .in('key', ['schedule_type', 'schedule_day', 'pending_card_ids', 'card_cursor']);
      const schedMeta = Object.fromEntries((schedRows ?? []).map((r) => [r.key, r.value]));
      const scheduleType = schedMeta.schedule_type ?? 'monthly';
      const scheduleDay  = parseInt(schedMeta.schedule_day ?? '1', 10);

      const now = new Date();
      if (scheduleType === 'weekly')       isSyncDay = now.getUTCDay()  === scheduleDay;
      else if (scheduleType === 'monthly') isSyncDay = now.getUTCDate() === scheduleDay;

      // 'manual_only' means exactly that: the cron must not drain a queue or
      // rotate prices either — everything runs from the admin UI.
      if (scheduleType === 'manual_only') {
        try {
          await supabase.from('sync_meta').upsert(
            { key: 'last_cron_result', value: 'skipped — schedule is manual only' },
            { onConflict: 'key' }
          );
        } catch {}
        return res.status(200).json({ skipped: true, reason: 'manual_only' });
      }

      const pendingCount  = JSON.parse(schedMeta.pending_card_ids ?? '[]').length;
      const pendingCursor = parseInt(schedMeta.card_cursor ?? '0', 10);
      const hasPending = pendingCount > pendingCursor;

      if (!isSyncDay && !hasPending) {
        cronSkippedSets = true;
        try {
          await supabase.from('sync_meta').upsert(
            { key: 'last_cron_result', value: `skipped sets — not sync day (${scheduleType}/${scheduleDay}, UTC day ${now.getUTCDay()}, UTC date ${now.getUTCDate()}); running price batch` },
            { onConflict: 'key' }
          );
        } catch {}
      }
    }
  } else {
    // Manual POST: require a logged-in admin user
    const ok = await requireAdminUser(req, res);
    if (!ok) return;
  }
  const CARD_BATCH_SIZE = 1000; // cards per invocation (upper bound — the time budget usually stops earlier)
  // Sets released within this window get all their cards re-fetched on every sync,
  // because TCGdex often publishes new sets with incomplete variant/rarity data.
  const RECENT_SET_DAYS = 365;

  // Record that this cron run is proceeding to actual sync work
  if (isScheduledRun && !cronSkippedSets) {
    try {
      await supabase.from('sync_meta').upsert(
        { key: 'last_cron_result', value: `running — ${isSyncDay ? 'sync day matched' : 'draining pending card queue'}, phase=${phase}` },
        { onConflict: 'key' }
      );
    } catch {}
  }

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
    // ── Set image verification ───────────────────────────────────────────────
    if (phase === 'images') {
      const { data: metaRows } = await supabase.from('sync_meta').select('key, value').in('key', ['image_cursor']);
      const cursor = parseInt(Object.fromEntries((metaRows ?? []).map((r) => [r.key, r.value])).image_cursor ?? '0', 10);

      const setsRes = await fetchWithRetry(`${API}/sets`);
      if (!setsRes.ok) throw new Error(`Sets fetch failed: ${setsRes.status}`);
      const apiSets = Object.fromEntries((await setsRes.json()).map((s) => [s.id, s]));

      const dbSets = [];
      for (let from = 0; ; from += 1000) {
        const { data: page } = await supabase.from('sets').select('id, logo_image, symbol_image').order('id').range(from, from + 999);
        if (!page || page.length === 0) break;
        dbSets.push(...page);
        if (page.length < 1000) break;
      }

      log(`Verifying set images ${cursor + 1}–${dbSets.length} of ${dbSets.length}…`);
      let checked = 0, fixed = 0, cleared = 0;
      const IMG_BATCH = 10;
      for (let i = cursor; i < dbSets.length; i += IMG_BATCH) {
        // Don't start a batch unless its worst case fits — otherwise the platform
        // can kill the function before image_cursor below is persisted.
        if (timeLeft() < IMG_BATCH_WORST_MS) break;
        const batch = dbSets.slice(i, i + IMG_BATCH);
        await Promise.all(batch.map(async (s) => {
          const api = apiSets[s.id] ?? {};
          const [logo_image, symbol_image] = await Promise.all([
            verifyImage(s.logo_image,   api.logo),
            verifyImage(s.symbol_image, api.symbol),
          ]);
          const patch = {};
          if (logo_image   !== (s.logo_image   ?? null)) patch.logo_image   = logo_image;
          if (symbol_image !== (s.symbol_image ?? null)) patch.symbol_image = symbol_image;
          if (Object.keys(patch).length) {
            const { error } = await supabase.from('sets').update(patch).eq('id', s.id);
            if (error) throw new Error(`Set image update (${s.id}): ${error.message}`);
            Object.values(patch).forEach((v) => (v ? fixed++ : cleared++));
            log(`  ${s.id}: ${Object.entries(patch).map(([k, v]) => `${k} → ${v ?? 'none'}`).join(', ')}`);
          }
        }));
        checked += batch.length;
      }

      const newCursor = cursor + checked;
      const remaining = dbSets.length - newCursor;
      await supabase.from('sync_meta').upsert(
        { key: 'image_cursor', value: remaining <= 0 ? '0' : String(newCursor) },
        { onConflict: 'key' }
      );
      log(`Checked ${checked} sets: ${fixed} image URLs repaired, ${cleared} dead images cleared.`);
      log(remaining <= 0
        ? 'Set image verification complete!'
        : `${remaining} sets remaining — click "Verify Set Images" again to continue.`);
      return res.end();
    }

    // Scheduled auto runs: only start a fresh sets phase on the configured sync
    // day, and only if no previous run left cards still queued. Re-running the
    // sets phase would rebuild the pending list and reset the cursor to 0.
    let runSetsPhase = phase === 'sets' || phase === 'auto';
    if (isScheduledRun && phase === 'auto') {
      if (cronSkippedSets) {
        runSetsPhase = false;
      } else {
        const { data: pendingRows } = await supabase
          .from('sync_meta')
          .select('key, value')
          .in('key', ['pending_card_ids', 'card_cursor']);
        const pendingMeta = Object.fromEntries((pendingRows ?? []).map((r) => [r.key, r.value]));
        const pendingCount = JSON.parse(pendingMeta.pending_card_ids ?? '[]').length;
        const pendingCursor = parseInt(pendingMeta.card_cursor ?? '0', 10);
        if (pendingCount > pendingCursor) {
          log(`Resuming previous sync: ${pendingCount - pendingCursor} cards still queued — skipping sets phase.`);
          runSetsPhase = false;
        } else if (!isSyncDay) {
          runSetsPhase = false;
        }
      }
    }

    if (runSetsPhase) {
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

      // Upsert basic set info — never overwrite a custom image that's already in the DB
      let repairedImages = 0;
      for (let i = 0; i < sets.length; i += BATCH) {
        const rows = await Promise.all(sets.slice(i, i + BATCH).map(async (s) => {
          const existing = existingImages[s.id] ?? {};
          // Always include logo/symbol columns so every row in the batch has the same
          // shape. If some rows omit a column, PostgREST normalises the missing fields
          // to NULL in the ON CONFLICT DO UPDATE, which would clear any existing value.
          const [logo_image, symbol_image] = await Promise.all([
            pickImage(existing.logo_image,   s.logo),
            pickImage(existing.symbol_image, s.symbol),
          ]);
          if (logo_image !== (existing.logo_image ?? null) || symbol_image !== (existing.symbol_image ?? null)) repairedImages++;
          // Remember what we stored so the set-detail pass below doesn't redo the work
          existingImages[s.id] = { id: s.id, logo_image, symbol_image };
          return {
            id: s.id,
            name: s.name,
            total: s.cardCount?.total ?? null,
            printed_total: s.cardCount?.official ?? null,
            logo_image,
            symbol_image,
          };
        }));
        const { error } = await supabase.from('sets').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Sets upsert: ${error.message}`);
      }
      log(`Upserted ${sets.length} sets (${repairedImages} set images added/repaired). Fetching set details…`);

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
      const queuedIds = new Set();
      let refreshedRecentCount = 0;
      const recentCutoff = Date.now() - RECENT_SET_DAYS * 24 * 60 * 60 * 1000;
      let detailsCutShort = false;
      for (let i = 0; i < sets.length; i += BATCH) {
        // A slow upstream can push this loop past the budget. Stop early and persist
        // what has been queued so far rather than losing the whole run's progress;
        // the remaining sets are picked up on the next sync day.
        if (outOfTime()) {
          detailsCutShort = true;
          log(`Time budget reached after ${i} of ${sets.length} set details — saving partial card queue.`);
          break;
        }
        const batch = sets.slice(i, i + BATCH);
        const details = await fetchBatch(batch.map((s) => `${API}/sets/${s.id}`));
        for (const detail of details) {
          if (!detail) continue;
          // The set-detail endpoint sometimes carries a logo/symbol the list endpoint
          // omits — resolve those too, but still never touch a custom image.
          const imgs = existingImages[detail.id] ?? {};
          const [logo_image, symbol_image] = await Promise.all([
            imgs.logo_image   ? imgs.logo_image   : pickImage(imgs.logo_image,   detail.logo),
            imgs.symbol_image ? imgs.symbol_image : pickImage(imgs.symbol_image, detail.symbol),
          ]);
          await supabase.from('sets').update({
            series: detail.serie?.name ?? null,
            release_date: detail.releaseDate ?? null,
            total: detail.cardCount?.total ?? detail.cards?.length ?? null,
            printed_total: detail.cardCount?.official ?? null,
            ...(logo_image   && logo_image   !== imgs.logo_image   ? { logo_image }   : {}),
            ...(symbol_image && symbol_image !== imgs.symbol_image ? { symbol_image } : {}),
          }).eq('id', detail.id);
          existingImages[detail.id] = { id: detail.id, logo_image: logo_image ?? null, symbol_image: symbol_image ?? null };
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
                queuedIds.add(c.id);
                pendingCardIds.push(c.id);
              });
            }

            // Re-fetch every card in recently released sets so variant/rarity data
            // that TCGdex fills in after launch (e.g. reverse holo flags) gets picked up.
            const releaseTime = detail.releaseDate ? new Date(detail.releaseDate).getTime() : NaN;
            if (!isNaN(releaseTime) && releaseTime >= recentCutoff) {
              detail.cards.forEach((c) => {
                if (queuedIds.has(c.id)) return;
                queuedIds.add(c.id);
                pendingCardIds.push(c.id);
                if (imagelessIds.has(c.id)) imagelessIds.delete(c.id); // counted as imageless re-queue
                else refreshedRecentCount++;
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
                if (!queuedIds.has(c.id)) {
                  queuedIds.add(c.id);
                  pendingCardIds.push(c.id);
                }
                imagelessIds.delete(c.id); // prevent duplicate queuing across sets
              });
            }
          }
        }
        await sleep(80);
      }

      const requeuedImagelessCount = initialImagelessCount - imagelessIds.size;
      const newCardsQueuedCount = pendingCardIds.length - requeuedImagelessCount - refreshedRecentCount;
      log(`${initialExistingCount} cards in DB initially, ${initialImagelessCount} without images, ${newCardsQueuedCount} new cards queued, ${requeuedImagelessCount} imageless cards re-queued, ${refreshedRecentCount} cards from recent sets (last ${RECENT_SET_DAYS} days) queued for refresh.`);

      // Report after the detail pass, since that pass can fill in images the list endpoint omitted
      if (!detailsCutShort) {
        const noArtwork = sets.filter((s) => !existingImages[s.id]?.logo_image && !existingImages[s.id]?.symbol_image).map((s) => s.id);
        if (noArtwork.length) {
          log(`${noArtwork.length} sets still have no TCGdex artwork (showing default image; re-checked every sync): ${noArtwork.join(', ')}`);
        }
      }

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
        if (phase === 'cards') return res.end();
      } else if (outOfTime()) {
        log(`Time budget used by sets phase — ${pendingCardIds.length - cursor} cards will sync on the next run.`);
        if (phase === 'cards') return res.end();
      } else {

      const slice = pendingCardIds.slice(cursor, cursor + CARD_BATCH_SIZE);
      log(`Syncing cards ${cursor + 1}–${cursor + slice.length} of ${pendingCardIds.length}…`);

      // Scheduled runs hold back a reserve so the price batch after this still runs
      const cardsReserveMs = isScheduledRun && phase === 'auto' ? PRICE_RESERVE_MS : 0;
      let processed = 0;
      for (let i = 0; i < slice.length; i += BATCH) {
        if (timeLeft() <= cardsReserveMs) {
          log(`Time budget reached after ${processed} cards — saving progress.`);
          break;
        }
        const batch = slice.slice(i, i + BATCH);
        const cards = await fetchBatch(batch.map((id) => `${API}/cards/${id}`));
        // Only include optional fields when TCGdex returned them, so an incomplete
        // response can't null out data already stored (images, rarity, variants).
        const rows = cards.filter(Boolean).map((card) => ({
          id: card.id,
          set_id: card.set?.id ?? card.id.split('-')[0],
          name: card.name,
          number: card.localId ?? null,
          ...(card.rarity != null ? { rarity: card.rarity } : {}),
          ...(card.stage ? { subtypes: [card.stage] } : {}),
          ...(card.variants ? { variants: card.variants } : {}),
          ...(card.image ? {
            small_image: `${card.image}/low.webp`,
            large_image: `${card.image}/high.webp`,
          } : {}),
        }));
        // PostgREST normalises a batch to the union of keys and writes NULL for any
        // missing ones, so group rows by their key set and upsert each group separately.
        const groups = new Map();
        for (const row of rows) {
          const shape = Object.keys(row).sort().join(',');
          if (!groups.has(shape)) groups.set(shape, []);
          groups.get(shape).push(row);
        }
        for (const group of groups.values()) {
          const { error } = await supabase.from('cards').upsert(group, { onConflict: 'id' });
          if (error) throw new Error(`Cards upsert: ${error.message}`);
        }
        processed += batch.length;
        await sleep(80);
      }

      const newCursor = cursor + processed;
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
        if (isScheduledRun) {
          try {
            await supabase.from('sync_meta').upsert(
              { key: 'last_cron_result', value: `completed — all ${pendingCardIds.length} queued cards synced` },
              { onConflict: 'key' }
            );
          } catch {}
        }
      } else {
        await supabase.from('sync_meta').upsert(
          { key: 'card_cursor', value: String(newCursor) },
          { onConflict: 'key' }
        );
        log(isScheduledRun
          ? `Batch complete. ${remaining} cards remaining — the next daily cron run will continue.`
          : `Batch complete. ${remaining} cards remaining — click "Continue" to sync next batch.`);
        if (isScheduledRun) {
          try {
            await supabase.from('sync_meta').upsert(
              { key: 'last_cron_result', value: `completed — card batch done (${processed} cards), ${remaining} remaining` },
              { onConflict: 'key' }
            );
          } catch {}
        }
      }

      } // end cards-work block

      // Ending the response here would let the platform terminate the function
      // before the price batch below runs, so only end when this was the whole job.
      if (phase === 'cards' || !isScheduledRun) return res.end();
    }
    // Prices phase — fetch pricing for all cards in batches, update price columns only
    // Also runs on every scheduled cron with time to spare (one cursor-batch per run keeps prices rotating)
    if (phase === 'prices' || (isScheduledRun && phase === 'auto')) {
      if (isScheduledRun && phase === 'auto' && timeLeft() < 10_000) {
        log('Not enough time left for a price batch this run — skipping.');
        return res.end();
      }
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

      let processed = 0;
      for (let i = 0; i < slice.length; i += BATCH) {
        if (outOfTime()) {
          log(`Time budget reached after ${processed} price updates — saving progress.`);
          break;
        }
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
        processed += batch.length;
        await sleep(80);
      }

      const newCursor = cursor + processed;
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

      if (isScheduledRun) {
        try {
          await supabase.from('sync_meta').upsert(
            {
              key: 'last_cron_result',
              value: (remaining <= 0 ? 'completed — full price cycle done' : `completed — price batch done, ${remaining} remaining`)
                + (cronSkippedSets ? ' (sets/cards skipped — not sync day)' : ''),
            },
            { onConflict: 'key' }
          );
        } catch {}
      }

      return res.end();
    }

  } catch (err) {
    const cause = err?.cause;
    const detail = cause?.message ?? cause?.code ?? err.message ?? 'unknown error';
    log(`Error: ${detail}`);
    if (isScheduledRun) {
      try {
        await supabase.from('sync_meta').upsert(
          { key: 'last_cron_result', value: `error — ${detail}` },
          { onConflict: 'key' }
        );
      } catch {}
    }
    res.end();
  }
}


