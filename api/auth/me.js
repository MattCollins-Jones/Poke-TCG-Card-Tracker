import { getUser } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const isAdmin = !!(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);

  res.json({ isAdmin });
}
