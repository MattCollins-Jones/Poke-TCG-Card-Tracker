import { createServiceClient, requireUser } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('collection')
      .select('set_id, card_id')
      .eq('user_id', user.id)
      .eq('wishlist', false);

    if (error) return res.status(500).json({ error: error.message });

    const summary = {};
    (data ?? []).forEach(({ set_id, card_id }) => {
      if (!summary[set_id]) summary[set_id] = new Set();
      summary[set_id].add(card_id);
    });

    const result = Object.entries(summary).map(([set_id, cards]) => ({
      set_id,
      owned_cards: cards.size,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
