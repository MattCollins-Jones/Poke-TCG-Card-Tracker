import { createServiceClient, getUser } from '../../lib/supabase.js';

async function requireAdmin(req, res) {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorised' }); return null; }
  if (!process.env.ADMIN_EMAIL || user.email !== process.env.ADMIN_EMAIL) {
    res.status(403).json({ error: 'Forbidden — admin only' });
    return null;
  }
  return user;
}

const TCGDEX = 'https://api.tcgdex.net/v2/en';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { setId, cardId } = req.query;

  if (!setId && !cardId) {
    return res.status(400).json({ error: 'Provide setId or cardId query param' });
  }

  const supabase = createServiceClient();

  // ── Card lookup ────────────────────────────────────────────────────────────
  if (cardId) {
    const [apiRes, { data: dbRow }] = await Promise.all([
      fetch(`${TCGDEX}/cards/${cardId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      supabase.from('cards').select('id, set_id, name, number, rarity, subtypes, variants, small_image, large_image, hidden').eq('id', cardId).single(),
    ]);
    return res.json({ type: 'card', cardId, api: apiRes, db: dbRow ?? null });
  }

  // ── Set lookup ─────────────────────────────────────────────────────────────
  const [apiRes, { data: dbCards }] = await Promise.all([
    fetch(`${TCGDEX}/sets/${setId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    supabase.from('cards')
      .select('id, name, number, rarity, subtypes, variants, small_image, large_image, hidden')
      .eq('set_id', setId),
  ]);

  if (!apiRes && (!dbCards || dbCards.length === 0)) {
    return res.status(404).json({ error: `Set "${setId}" not found in API or DB` });
  }

  const dbById = Object.fromEntries((dbCards ?? []).map(c => [c.id, c]));
  const apiCards = apiRes?.cards ?? [];

  const cards = apiCards.map(ac => {
    const db = dbById[ac.id] ?? null;
    return {
      id: ac.id,
      name: ac.name,
      number: ac.localId,
      apiHasImage: !!ac.image,
      dbExists: !!db,
      dbHasImage: !!(db?.small_image),
      dbHasFullData: !!(db?.rarity),
      dbHidden: db?.hidden ?? null,
    };
  });

  // Cards in DB but not in API (manually added or API removed them)
  const apiIds = new Set(apiCards.map(c => c.id));
  const dbOnlyCards = (dbCards ?? [])
    .filter(c => !apiIds.has(c.id))
    .map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      apiHasImage: null,
      dbExists: true,
      dbHasImage: !!(c.small_image),
      dbHasFullData: !!(c.rarity),
      dbHidden: c.hidden ?? null,
    }));

  const allCards = [...cards, ...dbOnlyCards];
  const summary = {
    apiTotal: apiCards.length,
    dbTotal: dbCards?.length ?? 0,
    dbVisible: (dbCards ?? []).filter(c => !c.hidden).length,
    dbHidden: (dbCards ?? []).filter(c => c.hidden).length,
    missingFromDb: cards.filter(c => !c.dbExists).length,
    missingImage: allCards.filter(c => c.dbExists && !c.dbHasImage).length,
    missingFullData: allCards.filter(c => c.dbExists && !c.dbHasFullData).length,
    dbOnly: dbOnlyCards.length,
  };

  return res.json({
    type: 'set',
    setId,
    apiSet: apiRes ? {
      id: apiRes.id,
      name: apiRes.name,
      releaseDate: apiRes.releaseDate,
      cardCount: apiRes.cardCount,
      serie: apiRes.serie,
    } : null,
    summary,
    cards: allCards,
  });
}
