import { createServiceClient, getUser } from '../../lib/supabase.js';

async function requireAdmin(req, res) {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorised' }); return null; }
  if (!process.env.ADMIN_EMAIL || user.email !== process.env.ADMIN_EMAIL) {
    res.status(403).json({ error: 'Forbidden — admin only' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  const supabase = createServiceClient();

  if (req.method === 'PATCH') {
    const allowed = ['name', 'rarity', 'number', 'small_image', 'large_image', 'subtypes'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key] || null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const { error } = await supabase.from('cards').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).end();
}
