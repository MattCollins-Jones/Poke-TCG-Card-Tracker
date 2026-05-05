/**
 * One-off migration:
 * 1. Append .webp to all image URLs that are missing it
 * 2. Fetch set details from TCGdex to populate series + release_date
 */
import db from './db.js';
import fetch from 'node-fetch';

const API = 'https://api.tcgdex.net/v2/en';
const BATCH = 20;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Step 1: Fix image URLs ---
console.log('[migrate] Fixing image URLs...');
const cardImgFix = db.prepare(`
  UPDATE cards
  SET small_image = small_image || '.webp',
      large_image = large_image || '.webp'
  WHERE small_image IS NOT NULL
    AND small_image NOT LIKE '%.webp'
`);
const cardResult = cardImgFix.run();
console.log(`[migrate] Fixed ${cardResult.changes} card image URLs.`);

const setImgFix = db.prepare(`
  UPDATE sets
  SET symbol_image = CASE WHEN symbol_image IS NOT NULL AND symbol_image NOT LIKE '%.webp' THEN symbol_image || '.webp' ELSE symbol_image END,
      logo_image   = CASE WHEN logo_image   IS NOT NULL AND logo_image   NOT LIKE '%.webp' THEN logo_image   || '.webp' ELSE logo_image   END
  WHERE (symbol_image IS NOT NULL OR logo_image IS NOT NULL)
`);
const setImgResult = setImgFix.run();
console.log(`[migrate] Fixed ${setImgResult.changes} set image URLs.`);

// --- Step 2: Fetch set details to populate series + release_date ---
console.log('[migrate] Fetching set list...');
const setsRes = await fetch(`${API}/sets`);
const sets = await setsRes.json();
console.log(`[migrate] Got ${sets.length} sets. Fetching details...`);

const updateSet = db.prepare(`
  UPDATE sets SET series=?, release_date=?, symbol_image=COALESCE(?, symbol_image), logo_image=COALESCE(?, logo_image) WHERE id=?
`);

for (let i = 0; i < sets.length; i += BATCH) {
  const batch = sets.slice(i, i + BATCH);
  const details = await Promise.all(
    batch.map(async (s) => {
      try {
        const r = await fetch(`${API}/sets/${s.id}`);
        return r.ok ? r.json() : null;
      } catch { return null; }
    })
  );
  for (const detail of details) {
    if (!detail) continue;
    const serieName = detail.serie?.name ?? null;
    const releaseDate = detail.releaseDate ?? null;
    const logo = detail.logo ? `${detail.logo}.webp` : null;
    const symbol = detail.symbol ? `${detail.symbol}.webp` : null;
    updateSet.run(serieName, releaseDate, symbol, logo, detail.id);
  }
  console.log(`[migrate] Sets: ${Math.min(i + BATCH, sets.length)} / ${sets.length}`);
  await sleep(50);
}

console.log('[migrate] Done! Series and images updated.');
