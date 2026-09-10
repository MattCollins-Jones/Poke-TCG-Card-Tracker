import { createServiceClient } from '../_lib/supabase.js';

function shapeCard(c, setMap) {
  const setInfo = setMap ? (setMap[c.set_id] ?? {}) : null;
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ?? [],
    variants: c.variants ?? null,
    images: { small: c.small_image, large: c.large_image },
    set: setInfo
      ? {
          id: c.set_id,
          name: setInfo.name ?? c.set_id,
          series: setInfo.series ?? null,
          releaseDate: setInfo.release_date ?? null,
          images: { symbol: setInfo.symbol_image ?? null, logo: setInfo.logo_image ?? null },
        }
      : { id: c.set_id },
    pricing: (c.cm_trend || c.cm_trend_holo || c.tcp_normal_market || c.tcp_reverse_market) ? {
      cardmarket: c.cm_trend != null ? {
        trend: c.cm_trend,
        avg30: c.cm_avg30,
        low: c.cm_low,
        trendHolo: c.cm_trend_holo,
        avg30Holo: c.cm_avg30_holo,
      } : null,
      tcgplayer: c.tcp_normal_market != null ? {
        normalMarket: c.tcp_normal_market,
        normalLow: c.tcp_normal_low,
        reverseMarket: c.tcp_reverse_market,
      } : null,
      updatedAt: c.price_updated_at,
    } : null,
  };
}

async function handleSearch(req, res, supabase) {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ data: [] });

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, name, number, rarity, subtypes, variants, small_image, large_image, set_id, cm_trend, cm_avg30, cm_low, cm_trend_holo, cm_avg30_holo, tcp_normal_market, tcp_normal_low, tcp_reverse_market, price_updated_at')
    .ilike('name', `%${q.trim()}%`)
    .eq('hidden', false)
    .order('name')
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  if (!cards || cards.length === 0) return res.json({ data: [] });

  const setIds = [...new Set(cards.map((c) => c.set_id))];
  const { data: sets } = await supabase
    .from('sets')
    .select('id, name, series, symbol_image, logo_image, release_date')
    .in('id', setIds);

  const setMap = {};
  (sets ?? []).forEach((s) => { setMap[s.id] = s; });

  const shaped = cards.map((c) => shapeCard(c, setMap));
  shaped.sort((a, b) => {
    const da = a.set.releaseDate ?? '', db = b.set.releaseDate ?? '';
    if (da !== db) return db.localeCompare(da);
    const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return (a.number ?? '').localeCompare(b.number ?? '');
  });

  res.json({ data: shaped, total: shaped.length });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { setId, rarities } = req.query;
  const supabase = createServiceClient();

  try {
    if (setId === 'search') return await handleSearch(req, res, supabase);

    // Return distinct rarities for the set when ?rarities=1
    if (rarities === '1') {
      const { data, error } = await supabase
        .from('cards')
        .select('rarity')
        .eq('set_id', setId)
        .not('rarity', 'is', null)
        .order('rarity');
      if (error) return res.status(500).json({ error: error.message });
      return res.json([...new Set((data ?? []).map((r) => r.rarity))]);
    }

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

    rows.sort((a, b) => {
      const an = a.number ?? '', bn = b.number ?? '';
      const ai = parseInt(an, 10), bi = parseInt(bn, 10);
      if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
      return an.localeCompare(bn);
    });

    res.json({ data: rows.map((c) => shapeCard(c, null)), totalCount: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

