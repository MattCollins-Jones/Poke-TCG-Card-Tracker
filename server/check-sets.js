import db from './db.js';

const empty = db.prepare(`
  SELECT s.id, s.name, s.series, COUNT(c.id) as cnt
  FROM sets s LEFT JOIN cards c ON c.set_id=s.id
  GROUP BY s.id HAVING cnt=0
`).all();
console.log('EMPTY SETS (' + empty.length + '):', JSON.stringify(empty.map(s => s.id + ' - ' + s.name)));

const noLogo = db.prepare(`
  SELECT s.id, s.name, s.series
  FROM sets s
  WHERE (s.logo_image IS NULL OR s.logo_image='')
  AND EXISTS (SELECT 1 FROM cards c WHERE c.set_id=s.id)
`).all();
console.log('HAS CARDS NO LOGO (' + noLogo.length + '):', JSON.stringify(noLogo.map(s => s.id + ' - ' + s.name + ' [' + s.series + ']')));

// Also show promo sets that do have logos (to copy from)
const promoSets = db.prepare(`
  SELECT s.id, s.name, s.series, s.logo_image
  FROM sets s
  WHERE (s.name LIKE '%Promo%' OR s.name LIKE '%promo%' OR s.name LIKE '%Black Star%')
  AND s.logo_image IS NOT NULL AND s.logo_image != ''
`).all();
console.log('PROMO SETS WITH LOGOS:', JSON.stringify(promoSets.map(s => s.id + ' - ' + s.name + ' -> ' + s.logo_image)));

const pocket = db.prepare(`SELECT id, name, logo_image FROM sets WHERE series='Pokémon TCG Pocket' ORDER BY id`).all();
console.log('POCKET:', JSON.stringify(pocket.map(s => s.id + ': ' + (s.logo_image||'null'))));
const me = db.prepare(`SELECT id, name, logo_image FROM sets WHERE series='Mega Evolution' ORDER BY id`).all();
console.log('ME:', JSON.stringify(me.map(s => s.id + ': ' + (s.logo_image||'null'))));
const mcd = db.prepare(`SELECT id, name, logo_image FROM sets WHERE series LIKE '%McDonald%' ORDER BY id`).all();
console.log('MCD:', JSON.stringify(mcd.map(s => s.id + ': ' + (s.logo_image||'null'))));
