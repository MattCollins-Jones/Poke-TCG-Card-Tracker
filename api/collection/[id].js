import { createServiceClient, requireUser } from '../_lib/supabase.js';
import { buildPublicShare, listShares, createShare, updateShare, deleteShare } from '../_lib/shares.js';

function sendError(res, err) {
  res.status(err.status ?? 500).json({ error: err.message });
}

// GET /api/collection/share?slug=… — public, unauthenticated, edge-cached.
// Shares are multiplexed into this function to stay within the Vercel Hobby function limit.
async function handlePublicShare(req, res, supabase) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const payload = await buildPublicShare(supabase, req.query.slug);
    if (!payload) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'This share link is not available' });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.json(payload);
  } catch (err) {
    return sendError(res, err);
  }
}

// /api/collection/shares — owner CRUD for share links
async function handleOwnerShares(req, res, supabase, user) {
  try {
    if (req.method === 'GET') return res.json(await listShares(supabase, user.id));
    if (req.method === 'POST') {
      const { share, created } = await createShare(supabase, user.id, req.body ?? {});
      return res.status(created ? 201 : 200).json(share);
    }
    if (req.method === 'PATCH') {
      const { id, ...patch } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      return res.json(await updateShare(supabase, user.id, id, patch));
    }
    if (req.method === 'DELETE') {
      const id = req.query.share_id ?? req.body?.id;
      if (!id) return res.status(400).json({ error: 'share_id is required' });
      await deleteShare(supabase, user.id, id);
      return res.json({ success: true });
    }
    return res.status(405).end();
  } catch (err) {
    return sendError(res, err);
  }
}

export default async function handler(req, res) {
  const { id } = req.query;
  const supabase = createServiceClient();

  if (id === 'share') return handlePublicShare(req, res, supabase);

  const user = await requireUser(req, res);
  if (!user) return;

  if (id === 'shares') return handleOwnerShares(req, res, supabase, user);

  if (req.method === 'PUT') {
    const { quantity, condition, wishlist, notes } = req.body;

    const { error } = await supabase
      .from('collection')
      .update({ quantity, condition, wishlist: !!wishlist, notes: notes ?? null })
      .eq('id', id)
      .eq('user_id', user.id); // RLS also enforces this, but belt-and-braces

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('collection')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).end();
}

