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

  const { setId } = req.query;
  if (!setId) return res.status(400).json({ error: 'setId required' });

  const supabase = createServiceClient();

  // Return ALL cards including hidden ones
  const { data: rows, error } = await supabase
    .from('cards')
    .select('*')
    .eq('set_id', setId);

  if (error) return res.status(500).json({ error: error.message });

  const cards = (rows ?? []).map(c => ({
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    hidden: c.hidden ?? false,
    images: { small: c.small_image, large: c.large_image },
  }));

  // Sort numerically
  cards.sort((a, b) => {
    const ai = parseInt(a.number ?? '', 10), bi = parseInt(b.number ?? '', 10);
    if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
    return (a.number ?? '').localeCompare(b.number ?? '');
  });

  res.json({ data: cards });
}
