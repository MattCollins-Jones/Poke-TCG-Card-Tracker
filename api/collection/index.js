import { createServiceClient, requireUser } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = createServiceClient();

  if (req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;

    const { wishlist, set_id } = req.query;
    let query = supabase
      .from('collection')
      .select('*')
      .eq('user_id', user.id)
      .order('set_id')
      .order('card_number');

    if (wishlist !== undefined) query = query.eq('wishlist', wishlist === 'true');
    if (set_id) query = query.eq('set_id', set_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  }

  if (req.method === 'POST') {
    const user = await requireUser(req, res);
    if (!user) return;

    const {
      card_id, set_id, card_name, set_name, card_number, card_image,
      rarity, finish, quantity, condition, wishlist, notes,
    } = req.body;

    if (!card_id || !set_id || !card_name) {
      return res.status(400).json({ error: 'card_id, set_id, and card_name are required' });
    }

    const cardFinish = finish ?? 'normal';

    const { data, error } = await supabase
      .from('collection')
      .upsert({
        user_id: user.id,
        card_id, set_id, card_name,
        set_name: set_name ?? null,
        card_number: card_number ?? null,
        card_image: card_image ?? null,
        rarity: rarity ?? null,
        finish: cardFinish,
        quantity: quantity ?? 1,
        condition: condition ?? 'mint',
        wishlist: wishlist ? true : false,
        notes: notes ?? null,
      }, { onConflict: 'user_id,card_id,finish' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ id: data.id, updated: false });
  }

  res.status(405).end();
}
