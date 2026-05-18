import { createServiceClient } from '../lib/supabase.js';

function shapeCard(c, setMap) {
  const setInfo = setMap[c.set_id] ?? {};
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ?? [],
    variants: c.variants ?? null,
    images: { small: c.small_image, large: c.large_image },
    set: {
      id: c.set_id,
      name: setInfo.name ?? c.set_id,
      series: setInfo.series ?? null,
      releaseDate: setInfo.release_date ?? null,
      images: {
        symbol: setInfo.symbol_image ?? null,
        logo: setInfo.logo_image ?? null,
      },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ data: [] });

  const supabase = createServiceClient();

  try {
    const { data: cards, error } = await supabase
      .from('cards')
      .select('id, name, number, rarity, subtypes, variants, small_image, large_image, set_id')
      .ilike('name', `%${q.trim()}%`)
      .eq('hidden', false)
      .order('name')
      .limit(200);

    if (error) return res.status(500).json({ error: error.message });
    if (!cards || cards.length === 0) return res.json({ data: [] });

    // Fetch set info for all unique set IDs in the results
    const setIds = [...new Set(cards.map((c) => c.set_id))];
    const { data: sets } = await supabase
      .from('sets')
      .select('id, name, series, symbol_image, logo_image, release_date')
      .in('id', setIds);

    const setMap = {};
    (sets ?? []).forEach((s) => { setMap[s.id] = s; });

    // Sort by set release date desc (newest sets first), then card number within each set
    const shaped = cards.map((c) => shapeCard(c, setMap));
    shaped.sort((a, b) => {
      const da = a.set.releaseDate ?? '';
      const db = b.set.releaseDate ?? '';
      if (da !== db) return db.localeCompare(da); // newest first
      const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return (a.number ?? '').localeCompare(b.number ?? '');
    });

    res.json({ data: shaped, total: shaped.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
