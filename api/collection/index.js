import { createServiceClient, requireUser } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = createServiceClient();

  if (req.method === 'GET') {
    const user = await requireUser(req, res);
    if (!user) return;

    const { wishlist, set_id, mode } = req.query;

    // ?mode=summary — per-set owned card counts (used by SetsPage)
    if (mode === 'summary') {
      const { data, error } = await supabase
        .from('collection')
        .select('set_id, card_id')
        .eq('user_id', user.id)
        .eq('wishlist', false);

      if (error) return res.status(500).json({ error: error.message });

      const summary = {};
      (data ?? []).forEach(({ set_id: sid, card_id }) => {
        if (!summary[sid]) summary[sid] = new Set();
        summary[sid].add(card_id);
      });

      return res.json(
        Object.entries(summary).map(([sid, cards]) => ({
          set_id: sid,
          owned_cards: cards.size,
        }))
      );
    }

    // ?mode=ids — lightweight card_id + quantity list
    if (mode === 'ids') {
      const { data, error } = await supabase
        .from('collection')
        .select('card_id, quantity, wishlist')
        .eq('user_id', user.id);

      if (error) return res.status(500).json({ error: error.message });
      return res.json(data ?? []);
    }

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

