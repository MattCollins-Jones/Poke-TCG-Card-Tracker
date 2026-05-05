import { createSupabaseClient, requireUser } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireUser(req, res);
  if (!user) return;

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('collection')
    .select('card_id, quantity, wishlist')
    .eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}
