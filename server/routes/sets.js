import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, COUNT(c.id) as card_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    GROUP BY s.id
    HAVING card_count > 0
    ORDER BY s.release_date DESC
  `).all();
  if (rows.length === 0) {
    return res.status(503).json({ error: 'No data yet — run a sync first via POST /api/sync/start' });
  }
  const data = rows.map((s) => ({
    id: s.id,
    name: s.name,
    series: s.series,
    printedTotal: s.printed_total,
    total: s.card_count,          // actual count from DB
    releaseDate: s.release_date,
    ptcgoCode: s.ptcgo_code,
    images: { symbol: s.symbol_image, logo: s.logo_image },
  }));
  res.json({ data });
});

export default router;
