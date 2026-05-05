import db from './db.js';
// Use 2011 McDonald's logo for all — it's the standard McDonald's arches logo
const src = db.prepare(`SELECT logo_image FROM sets WHERE id='2011bw'`).get();
console.log('Using logo:', src.logo_image);
db.prepare(`UPDATE sets SET logo_image=? WHERE id IN ('2022swsh','2023sv','2024sv')`).run(src.logo_image);
console.log('Done — 2022, 2023, 2024 McDonald\'s sets updated');
