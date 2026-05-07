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

  res.json({ data });
}
