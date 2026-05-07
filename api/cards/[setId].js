import { createServiceClient } from '../lib/supabase.js';

function shapeCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ?? [],
    variants: c.variants ?? null,
    images: { small: c.small_image, large: c.large_image },
    set: { id: c.set_id },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { setId } = req.query;
  const supabase = createServiceClient();

  try {
    const { data: rows, error } = await supabase
      .from('cards')
      .select('*')
      .eq('set_id', setId)
      .eq('hidden', false)
      .order('number');

    if (error) return res.status(500).json({ error: error.message });
    if (!rows || rows.length === 0) {
      return res.status(503).json({ error: 'No cards found — run a sync first' });
    }

    // Sort numerically then alphabetically — guard against null number
    rows.sort((a, b) => {
      const an = a.number ?? '', bn = b.number ?? '';
      const ai = parseInt(an, 10), bi = parseInt(bn, 10);
      if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
      return an.localeCompare(bn);
    });

    res.json({ data: rows.map(shapeCard), totalCount: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
