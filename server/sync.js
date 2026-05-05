import fetch from 'node-fetch';
import db from './db.js';

const API = 'https://api.tcgdex.net/v2/en';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch a batch of URLs concurrently, returns array of results (null on failure)
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

export async function syncAllData({ onProgress } = {}) {
  // 1. Fetch all sets
  onProgress?.('Fetching sets list…');
  const setsRes = await fetch(`${API}/sets`);
  if (!setsRes.ok) throw new Error(`Sets fetch failed: ${setsRes.status}`);
  const sets = await setsRes.json();

  const upsertSet = db.prepare(`
    INSERT INTO sets (id, name, series, printed_total, total, release_date, symbol_image, logo_image, ptcgo_code, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, total=excluded.total,
      symbol_image=excluded.symbol_image, logo_image=excluded.logo_image,
      synced_at=excluded.synced_at
  `);

  for (const s of sets) {
    const logo = s.logo ? `${s.logo}.webp` : null;
    const symbol = s.symbol ? `${s.symbol}.webp` : null;
    upsertSet.run(s.id, s.name, null, null, s.cardCount?.official ?? null, null, symbol, logo, null);
  }
  onProgress?.(`Synced ${sets.length} sets. Fetching card lists…`);

  // 2. Fetch set details in batches to collect all card IDs + series + release date
  const BATCH = 20;
  const allCardIds = [];

  const updateSet = db.prepare(`
    UPDATE sets SET series=?, release_date=?, symbol_image=?, logo_image=? WHERE id=?
  `);

  for (let i = 0; i < sets.length; i += BATCH) {
    const batch = sets.slice(i, i + BATCH);
    const details = await fetchBatch(batch.map((s) => `${API}/sets/${s.id}`));
    for (const detail of details) {
      if (!detail) continue;
      const serieName = detail.serie?.name ?? null;
      const releaseDate = detail.releaseDate ?? null;
      const logo = detail.logo ? `${detail.logo}.webp` : null;
      const symbol = detail.symbol ? `${detail.symbol}.webp` : null;
      updateSet.run(serieName, releaseDate, symbol, logo, detail.id);
      if (!detail.cards) continue;
      for (const card of detail.cards) allCardIds.push(card.id);
    }
    onProgress?.(`Fetching card lists: ${Math.min(i + BATCH, sets.length)} / ${sets.length} sets…`);
    await sleep(100);
  }

  onProgress?.(`Found ${allCardIds.length} cards. Fetching card details — this takes a few minutes…`);

  // 3. Fetch individual card details in batches of 20
  const upsertCard = db.prepare(`
    INSERT INTO cards (id, set_id, name, number, rarity, subtypes, variants, small_image, large_image, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, number=excluded.number, rarity=excluded.rarity,
      subtypes=excluded.subtypes, variants=excluded.variants,
      small_image=excluded.small_image, large_image=excluded.large_image,
      synced_at=excluded.synced_at
  `);

  let done = 0;
  for (let i = 0; i < allCardIds.length; i += BATCH) {
    const batch = allCardIds.slice(i, i + BATCH);
    const cards = await fetchBatch(batch.map((id) => `${API}/cards/${id}`));

    for (const card of cards) {
      if (!card) continue;
      // Build subtypes from stage + category
      const subtypes = [];
      if (card.stage) subtypes.push(card.stage);

      upsertCard.run(
        card.id,
        card.set?.id ?? card.id.split('-')[0],
        card.name,
        card.localId ?? null,
        card.rarity ?? null,
        subtypes.length ? JSON.stringify(subtypes) : null,
        card.variants ? JSON.stringify(card.variants) : null,
        card.image ? `${card.image}/low.webp` : null,
        card.image ? `${card.image}/high.webp` : null,
      );
    }

    done += batch.length;
    if (done % 1000 === 0 || done >= allCardIds.length) {
      onProgress?.(`Syncing cards: ${done} / ${allCardIds.length}…`);
    }
    await sleep(100);
  }

  db.prepare(`INSERT INTO sync_meta (key, value) VALUES ('last_sync', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run();

  onProgress?.(`Sync complete: ${sets.length} sets, ${done} cards.`);
  return { sets: sets.length, cards: done };
}

export function getLastSyncTime() {
  const row = db.prepare(`SELECT value FROM sync_meta WHERE key='last_sync'`).get();
  return row?.value ?? null;
}

export function isSyncNeeded() {
  const last = getLastSyncTime();
  if (!last) return true;
  const lastDate = new Date(last + 'Z');
  const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 7;
}
