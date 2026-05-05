/**
 * Fill missing set logos from pokemontcg.io API.
 * Matches sets by name (exact + fuzzy) with manual overrides for known mismatches.
 */
import db from './db.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, 'public', 'logos');
fs.mkdirSync(LOGOS_DIR, { recursive: true });

// Manual overrides: TCGdex id → pokemontcg.io id
const MANUAL = {
  'svp':          'svp',    // SVP Black Star Promos → Scarlet & Violet Black Star Promos
  'sve':          'sve',    // Scarlet & Violet Energy → Scarlet & Violet Energies
  'sv05':         'sv5',    // Temporal Forces (TCGdex uses sv05, old uses sv5)
  'bog':          'bp',     // Best of game → Best of Game
  'sma':          'sma',    // Hidden Fates Shiny Vault (same id!)
  'tk-ex-latia':  'tk1a',
  'tk-ex-latio':  'tk1b',
  'tk-ex-m':      'tk2b',
  'tk-ex-p':      'tk2a',
  '2011bw':       'mcd11',
  '2012bw':       'mcd12',
  '2014xy':       'mcd14',
  '2015xy':       'mcd15',
  '2016xy':       'mcd16',
  '2017sm':       'mcd17',
  '2018sm':       'mcd18',
  '2019sm':       'mcd19',
  '2021swsh':     'mcd21',
  '2022swsh':     'mcd22',
};

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
    return true;
  } catch { return false; }
}

// Fetch all old API sets
console.log('[fill-logos] Fetching pokemontcg.io sets…');
const oldRes = await fetch('https://api.pokemontcg.io/v2/sets?pageSize=500');
const { data: oldSets } = await oldRes.json();

// Build lookup maps: by id and by normalized name
const byId = {};
const byName = {};
for (const s of oldSets) {
  byId[s.id] = s;
  byName[s.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = s;
}

// Get missing sets from DB
const missing = db.prepare(`SELECT id, name FROM sets WHERE logo_image IS NULL OR logo_image = ''`).all();
console.log(`[fill-logos] ${missing.length} sets missing logos`);

const updateLogo = db.prepare(`UPDATE sets SET logo_image=? WHERE id=?`);
let filled = 0, skipped = 0;

for (const set of missing) {
  // Try manual mapping first, then name match
  const oldId = MANUAL[set.id];
  let oldSet = oldId ? byId[oldId] : null;

  if (!oldSet) {
    // Try exact name match (normalized)
    const key = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    oldSet = byName[key];
  }

  if (!oldSet?.images?.logo) {
    skipped++;
    continue;
  }

  const logoUrl = oldSet.images.logo;
  const dest = path.join(LOGOS_DIR, `${set.id}.png`);
  const ok = await downloadFile(logoUrl, dest);
  if (ok) {
    updateLogo.run(`/logos/${set.id}.png`, set.id);
    console.log(`  ✓ ${set.name} (from ${oldSet.name})`);
    filled++;
  } else {
    console.log(`  ✗ ${set.name} — download failed`);
    skipped++;
  }
}

console.log(`\n[fill-logos] Done: ${filled} logos filled, ${skipped} still missing.`);
