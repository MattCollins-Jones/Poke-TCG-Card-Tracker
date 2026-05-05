import { createServiceClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from('sets')
    .select('*, cards(count)')
    .order('release_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const withCounts = rows
    .map((s) => ({ ...s, card_count: s.cards[0]?.count ?? 0 }))
    .filter((s) => s.card_count > 0);

  if (withCounts.length === 0) {
    return res.status(503).json({ error: 'No data yet — run a sync first via POST /api/sync' });
  }

  const data = withCounts.map((s) => ({
    id: s.id,
    name: s.name,
    series: s.series,
    printedTotal: s.printed_total,
    total: s.card_count,
    releaseDate: s.release_date,
    ptcgoCode: s.ptcgo_code,
    images: { symbol: s.symbol_image, logo: s.logo_image },
  }));

  res.json({ data });
}
