import express from 'express';
import db from '../db.js';

const router = express.Router();

function shapeCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ? JSON.parse(c.subtypes) : [],
    variants: c.variants ? JSON.parse(c.variants) : null,
    images: { small: c.small_image, large: c.large_image },
    set: { id: c.set_id },
  };
}

router.get('/set/:setId', (req, res) => {
  const { setId } = req.params;
  const rows = db.prepare(`SELECT * FROM cards WHERE set_id = ? ORDER BY CAST(number AS INTEGER), number`).all(setId);
  if (rows.length === 0) {
    return res.status(503).json({ error: 'No cards found — run a sync first via POST /api/sync/start' });
  }
  res.json({ data: rows.map(shapeCard), totalCount: rows.length });
});

// GET /api/cards/rarities/:setId — distinct rarities in a set for the filter bar
router.get('/rarities/:setId', (req, res) => {
  const rows = db.prepare(
    `SELECT DISTINCT rarity FROM cards WHERE set_id = ? AND rarity IS NOT NULL ORDER BY rarity`
  ).all(req.params.setId);
  res.json(rows.map((r) => r.rarity));
});

router.get('/:cardId', (req, res) => {
  const c = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(req.params.cardId);
  if (!c) return res.status(404).json({ error: 'Card not found' });
  res.json({ data: shapeCard(c) });
});

export default router;
