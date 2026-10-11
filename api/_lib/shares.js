import { randomBytes } from 'node:crypto';
import { getAvailableFinishes, sortByNumber } from './finishes.js';

export const SHARE_TYPES = ['wishlist', 'set_missing'];

const SHARE_COLUMNS = 'id, slug, type, set_id, title, enabled, created_at';

function newSlug() {
  return randomBytes(12).toString('base64url');
}

async function chunkedIn(supabase, table, select, column, values, chunk = 200) {
  const out = [];
  for (let i = 0; i < values.length; i += chunk) {
    const { data, error } = await supabase.from(table).select(select).in(column, values.slice(i, i + chunk));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

function shapeSet(s, id) {
  if (!s) return { id, name: id, series: null, releaseDate: null, images: { logo: null, symbol: null } };
  return {
    id: s.id,
    name: s.name ?? s.id,
    series: s.series ?? null,
    releaseDate: s.release_date ?? null,
    images: { logo: s.logo_image ?? null, symbol: s.symbol_image ?? null },
  };
}

function shapeCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity ?? null,
    images: { small: c.small_image ?? null, large: c.large_image ?? null },
  };
}

function sortSets(a, b) {
  const da = a.releaseDate ?? '', db = b.releaseDate ?? '';
  if (da !== db) return db.localeCompare(da);
  return a.name.localeCompare(b.name);
}

/* ---------- Owner management (authenticated) ---------- */

export async function listShares(supabase, userId) {
  const { data, error } = await supabase
    .from('shares')
    .select(SHARE_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// One share per (user, type, set) — returns the existing one if present.
export async function createShare(supabase, userId, { type, set_id, title }) {
  if (!SHARE_TYPES.includes(type)) throw Object.assign(new Error('Invalid share type'), { status: 400 });
  if (type === 'set_missing' && !set_id) throw Object.assign(new Error('set_id is required'), { status: 400 });

  let existing = supabase.from('shares').select(SHARE_COLUMNS).eq('user_id', userId).eq('type', type);
  existing = type === 'set_missing' ? existing.eq('set_id', set_id) : existing.is('set_id', null);
  const { data: found, error: findErr } = await existing.maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (found) return { share: found, created: false };

  const cleanTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : null;

  const { data, error } = await supabase
    .from('shares')
    .insert({
      user_id: userId,
      slug: newSlug(),
      type,
      set_id: type === 'set_missing' ? set_id : null,
      title: cleanTitle,
      enabled: true,
    })
    .select(SHARE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { share: data, created: true };
}

export async function updateShare(supabase, userId, id, { enabled, title }) {
  const patch = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (title !== undefined) patch.title = typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : null;
  if (Object.keys(patch).length === 0) throw Object.assign(new Error('Nothing to update'), { status: 400 });

  const { data, error } = await supabase
    .from('shares')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(SHARE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error('Share not found'), { status: 404 });
  return data;
}

export async function deleteShare(supabase, userId, id) {
  const { error } = await supabase.from('shares').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/* ---------- Public payload (no auth) ---------- */

export async function buildPublicShare(supabase, slug) {
  if (!slug || typeof slug !== 'string' || slug.length > 64) return null;

  const { data: share, error } = await supabase
    .from('shares')
    .select('id, user_id, type, set_id, title, enabled, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!share || !share.enabled) return null;

  const base = {
    type: share.type,
    title: share.title,
    createdAt: share.created_at,
    generatedAt: new Date().toISOString(),
  };

  if (share.type === 'wishlist') return { ...base, ...(await buildWishlist(supabase, share.user_id)) };
  return { ...base, ...(await buildSetMissing(supabase, share.user_id, share.set_id)) };
}

async function buildWishlist(supabase, userId) {
  const { data: rows, error } = await supabase
    .from('collection')
    .select('card_id, set_id, card_name, card_number, card_image, rarity, finish')
    .eq('user_id', userId)
    .eq('wishlist', true);
  if (error) throw new Error(error.message);

  const wanted = rows ?? [];
  if (wanted.length === 0) return { sets: [], totals: { cards: 0, finishes: 0 } };

  const cardIds = [...new Set(wanted.map((r) => r.card_id))];
  const setIds = [...new Set(wanted.map((r) => r.set_id))];

  const [cards, sets] = await Promise.all([
    chunkedIn(supabase, 'cards', 'id, name, number, rarity, small_image, large_image, set_id', 'id', cardIds),
    chunkedIn(supabase, 'sets', 'id, name, series, release_date, logo_image, symbol_image', 'id', setIds),
  ]);
  const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]));
  const setMap = Object.fromEntries(sets.map((s) => [s.id, s]));

  const bySet = {};
  for (const r of wanted) {
    if (!bySet[r.set_id]) bySet[r.set_id] = { ...shapeSet(setMap[r.set_id], r.set_id), cards: {} };
    const group = bySet[r.set_id].cards;
    if (!group[r.card_id]) {
      const c = cardMap[r.card_id];
      group[r.card_id] = c
        ? { ...shapeCard(c), needed: [] }
        : {
            id: r.card_id, name: r.card_name, number: r.card_number, rarity: r.rarity,
            images: { small: r.card_image, large: null }, needed: [],
          };
    }
    if (!group[r.card_id].needed.includes(r.finish)) group[r.card_id].needed.push(r.finish);
  }

  const setsOut = Object.values(bySet)
    .map((s) => ({ ...s, cards: Object.values(s.cards).sort(sortByNumber) }))
    .sort(sortSets);

  return {
    sets: setsOut,
    totals: { cards: cardIds.length, finishes: wanted.length },
  };
}

async function buildSetMissing(supabase, userId, setId) {
  const [{ data: setRow, error: setErr }, { data: cards, error: cardErr }, { data: owned, error: ownErr }] =
    await Promise.all([
      supabase.from('sets').select('id, name, series, release_date, logo_image, symbol_image').eq('id', setId).maybeSingle(),
      supabase.from('cards').select('id, name, number, rarity, variants, small_image, large_image').eq('set_id', setId).eq('hidden', false),
      supabase.from('collection').select('card_id, finish, wishlist').eq('user_id', userId).eq('set_id', setId),
    ]);
  if (setErr) throw new Error(setErr.message);
  if (cardErr) throw new Error(cardErr.message);
  if (ownErr) throw new Error(ownErr.message);

  const ownedByCard = {};
  for (const r of owned ?? []) {
    if (r.wishlist) continue;
    if (!ownedByCard[r.card_id]) ownedByCard[r.card_id] = new Set();
    ownedByCard[r.card_id].add(r.finish);
  }

  let totalSlots = 0, ownedSlots = 0, fullyOwned = 0;
  const missing = [];
  for (const c of (cards ?? []).sort(sortByNumber)) {
    const finishes = getAvailableFinishes(c.variants);
    const has = ownedByCard[c.id] ?? new Set();
    const needed = finishes.filter((f) => !has.has(f));
    const ownedCount = finishes.length - needed.length;
    totalSlots += finishes.length;
    ownedSlots += ownedCount;
    if (ownedCount > 0) fullyOwned += 1;
    if (needed.length === 0) continue;
    missing.push({ ...shapeCard(c), needed });
  }

  const set = { ...shapeSet(setRow, setId), cards: missing };
  return {
    sets: [set],
    totals: {
      cards: missing.length,
      finishes: missing.reduce((s, c) => s + c.needed.length, 0),
      setCards: (cards ?? []).length,
      setOwnedCards: fullyOwned,
      masterSlots: totalSlots,
      masterOwned: ownedSlots,
    },
  };
}
