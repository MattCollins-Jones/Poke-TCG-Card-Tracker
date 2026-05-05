import { createServiceClient, requireUser } from '../../lib/supabase.js';

export default async function handler(req, res) {
  const { id } = req.query;
  const user = await requireUser(req, res);
  if (!user) return;

  const supabase = createServiceClient();

  if (req.method === 'PUT') {
    const { quantity, condition, wishlist, notes } = req.body;

    const { error } = await supabase
      .from('collection')
      .update({ quantity, condition, wishlist: !!wishlist, notes: notes ?? null })
      .eq('id', id)
      .eq('user_id', user.id); // RLS also enforces this, but belt-and-braces

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('collection')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).end();
}
