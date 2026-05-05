import db from './db.js';
db.prepare(`UPDATE sets SET logo_image='/logos/svp.png' WHERE id IN ('mep', 'mee')`).run();
console.log('Done — mep and mee now use svp logo');
