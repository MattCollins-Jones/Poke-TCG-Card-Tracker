/**
 * Downloads all set logos and symbols from TCGdex CDN to local storage.
 * Updates the DB to point to local URLs (/logos/{id}.webp, /symbols/{id}.webp)
 */
import db from './db.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, 'public', 'logos');
const SYMBOLS_DIR = path.join(__dirname, 'public', 'symbols');

fs.mkdirSync(LOGOS_DIR, { recursive: true });
fs.mkdirSync(SYMBOLS_DIR, { recursive: true });

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return true; // already cached
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
    return true;
  } catch { return false; }
}

const sets = db.prepare(`SELECT id, logo_image, symbol_image FROM sets`).all();
console.log(`[logos] Processing ${sets.length} sets…`);

let logoOk = 0, logoFail = 0, symOk = 0, symFail = 0;
const updateSet = db.prepare(`UPDATE sets SET logo_image=?, symbol_image=? WHERE id=?`);

for (const set of sets) {
  let newLogo = set.logo_image;
  let newSymbol = set.symbol_image;

  if (set.logo_image && set.logo_image.startsWith('http')) {
    const dest = path.join(LOGOS_DIR, `${set.id}.webp`);
    const ok = await downloadFile(set.logo_image, dest);
    if (ok) { newLogo = `/logos/${set.id}.webp`; logoOk++; }
    else { logoFail++; }
  }

  if (set.symbol_image && set.symbol_image.startsWith('http')) {
    const dest = path.join(SYMBOLS_DIR, `${set.id}.webp`);
    const ok = await downloadFile(set.symbol_image, dest);
    if (ok) { newSymbol = `/symbols/${set.id}.webp`; symOk++; }
    else { symFail++; }
  }

  updateSet.run(newLogo, newSymbol, set.id);
}

console.log(`[logos] Done. Logos: ${logoOk} saved, ${logoFail} unavailable.`);
console.log(`[symbols] Done. Symbols: ${symOk} saved, ${symFail} unavailable.`);
