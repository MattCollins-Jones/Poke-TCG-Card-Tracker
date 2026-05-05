/**
 * Assign same-series/same-era promo logos to sets that are still missing them.
 * No downloads needed — just point to already-cached logo files.
 */
import db from './db.js';

const assignments = [
  // EX-era promos/specials → Nintendo Black Star Promos
  ['ex5.5',     '/logos/np.webp'],
  ['exu',       '/logos/np.webp'],
  // DP Trainer Kits → DP Black Star Promos
  ['tk-dp-l',   '/logos/dpp.webp'],
  ['tk-dp-m',   '/logos/dpp.webp'],
  // HGSS Trainer Kits → HGSS Black Star Promos
  ['tk-hs-g',   '/logos/hgssp.webp'],
  ['tk-hs-r',   '/logos/hgssp.webp'],
  // BW Trainer Kits → BW Black Star Promos
  ['tk-bw-e',   '/logos/bwp.webp'],
  ['tk-bw-z',   '/logos/bwp.webp'],
  // XY Trainer Kits + Yellow A → XY Black Star Promos
  ['xya',       '/logos/xyp.webp'],
  ['tk-xy-n',   '/logos/xyp.webp'],
  ['tk-xy-sy',  '/logos/xyp.webp'],
  ['tk-xy-w',   '/logos/xyp.webp'],
  ['tk-xy-b',   '/logos/xyp.webp'],
  ['tk-xy-latio','/logos/xyp.webp'],
  ['tk-xy-latia','/logos/xyp.webp'],
  ['tk-xy-p',   '/logos/xyp.webp'],
  ['tk-xy-su',  '/logos/xyp.webp'],
  // SM Trainer Kits → SM Black Star Promos
  ['tk-sm-l',   '/logos/smp.webp'],
  ['tk-sm-r',   '/logos/smp.webp'],
  // McDonald's 2023/2024 → use 2022 logo (most recent available)
  ['2023sv',    '/logos/2022swsh.png'],
  ['2024sv',    '/logos/2022swsh.png'],
  // SV My First Battle → SVP Black Star Promos logo
  ['mfb',       '/logos/svp.png'],
  // TCG Pocket — use parent set logo (A3a→A3, A3b→A3, B1a→B1, B2a→B2)
  ['A3a',       '/logos/A3.webp'],
  ['A3b',       '/logos/A3.webp'],
  ['B1a',       '/logos/B1.webp'],
  ['B2a',       '/logos/B2.webp'],
  // Mega Evolution extras → ME main set logo
  ['mee',       '/logos/me01.webp'],
  ['mep',       '/logos/me01.webp'],
];

const update = db.prepare(`UPDATE sets SET logo_image=? WHERE id=? AND (logo_image IS NULL OR logo_image='')`);
let count = 0;
for (const [id, logo] of assignments) {
  const r = update.run(logo, id);
  if (r.changes) { console.log(`  ✓ ${id} → ${logo}`); count++; }
}
console.log(`Done: ${count} sets updated.`);
