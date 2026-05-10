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

  const supabase = createServiceClient();

  if (req.method === 'GET') {
    // Return ALL sets including hidden ones, with hidden flag exposed
    const { data: rows, error } = await supabase
      .from('sets')
      .select('*')
      .order('release_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const data = (rows ?? []).map(s => ({
      id: s.id,
      name: s.name,
      series: s.series,
      total: s.total ?? 0,
      printed_total: s.printed_total,
      releaseDate: s.release_date,
      hidden: s.hidden ?? false,
      images: { symbol: s.symbol_image, logo: s.logo_image },
    }));

    return res.json({ data });
  }

  if (req.method === 'POST') {
    const { id, name, series, release_date, total, logo_image, symbol_image } = req.body ?? {};
    if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

    const { error } = await supabase.from('sets').insert({
      id: id.trim().toLowerCase(),
      name: name.trim(),
      series: series?.trim() || null,
      release_date: release_date || null,
      total: total ? parseInt(total, 10) : null,
      logo_image: logo_image || null,
      symbol_image: symbol_image || null,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  res.status(405).end();
}
