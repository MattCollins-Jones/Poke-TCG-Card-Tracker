import { createServiceClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = createServiceClient();

  // Fetch sets and card counts in separate queries to avoid needing a FK relationship
  const [{ data: rows, error }, { data: cardCounts, error: countError }] = await Promise.all([
    supabase.from('sets').select('*').order('release_date', { ascending: false }),
    supabase.from('cards').select('set_id'),
  ]);

  if (error) return res.status(500).json({ error: error.message });
  if (countError) return res.status(500).json({ error: countError.message });

  // Build a count map from the cards rows
  const countMap = {};
  (cardCounts ?? []).forEach(({ set_id }) => {
    countMap[set_id] = (countMap[set_id] ?? 0) + 1;
  });

  if (!rows || rows.length === 0) {
    return res.status(503).json({ error: 'No data yet — run a sync first via POST /api/sync' });
  }

  const data = rows
    .map((s) => ({
      id: s.id,
      name: s.name,
      series: s.series,
      printedTotal: s.printed_total,
      total: countMap[s.id] ?? s.total ?? 0,
      releaseDate: s.release_date,
      ptcgoCode: s.ptcgo_code,
      images: { symbol: s.symbol_image, logo: s.logo_image },
    }))
    .filter((s) => s.total > 0);

  res.json({ data });
}
