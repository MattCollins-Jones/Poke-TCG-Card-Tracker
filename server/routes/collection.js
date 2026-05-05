import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/collection - all collection entries (optionally filter by wishlist)
router.get('/', (req, res) => {
  const { wishlist, set_id } = req.query;
  let query = 'SELECT * FROM collection WHERE 1=1';
  const params = [];

  if (wishlist !== undefined) {
    query += ' AND wishlist = ?';
    params.push(wishlist === 'true' ? 1 : 0);
  }
  if (set_id) {
    query += ' AND set_id = ?';
    params.push(set_id);
  }

  query += ' ORDER BY set_id, card_number';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// GET /api/collection/ids - just the card_ids the user owns (for fast lookup)
router.get('/ids', (req, res) => {
  const rows = db.prepare('SELECT card_id, quantity, wishlist FROM collection').all();
  res.json(rows);
});

// GET /api/collection/summary - owned card counts per set (base cards only, not wishlist)
router.get('/summary', (req, res) => {
  const rows = db.prepare(`
    SELECT set_id, COUNT(DISTINCT card_id) as owned_cards
    FROM collection
    WHERE wishlist = 0
    GROUP BY set_id
  `).all();
  res.json(rows);
});

// POST /api/collection - add or update a card
router.post('/', (req, res) => {
  const { card_id, set_id, card_name, set_name, card_number, card_image, rarity, finish, quantity, condition, wishlist, notes } = req.body;

  if (!card_id || !set_id || !card_name) {
    return res.status(400).json({ error: 'card_id, set_id, and card_name are required' });
  }

  const cardFinish = finish ?? 'normal';
  const existing = db.prepare('SELECT id FROM collection WHERE card_id = ? AND finish = ?').get(card_id, cardFinish);

  if (existing) {
    db.prepare(`
      UPDATE collection SET quantity=?, condition=?, wishlist=?, notes=?, set_name=?, card_number=?, card_image=?, rarity=?
      WHERE card_id=? AND finish=?
    `).run(quantity ?? 1, condition ?? 'mint', wishlist ? 1 : 0, notes ?? null, set_name, card_number, card_image, rarity, card_id, cardFinish);
    return res.json({ id: existing.id, updated: true });
  }

  const result = db.prepare(`
    INSERT INTO collection (card_id, set_id, card_name, set_name, card_number, card_image, rarity, finish, quantity, condition, wishlist, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(card_id, set_id, card_name, set_name, card_number, card_image, rarity, cardFinish, quantity ?? 1, condition ?? 'mint', wishlist ? 1 : 0, notes ?? null);

  res.status(201).json({ id: result.lastInsertRowid, updated: false });
});

// PUT /api/collection/:id
router.put('/:id', (req, res) => {
  const { quantity, condition, wishlist, notes } = req.body;
  const { id } = req.params;

  const row = db.prepare('SELECT id FROM collection WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE collection SET quantity=?, condition=?, wishlist=?, notes=? WHERE id=?')
    .run(quantity, condition, wishlist ? 1 : 0, notes ?? null, id);

  res.json({ success: true });
});

// DELETE /api/collection/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM collection WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
