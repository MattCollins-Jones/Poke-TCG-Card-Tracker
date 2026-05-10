import { createServiceClient, getUser } from '../lib/supabase.js';

const BUCKET = 'pokemon-images';

async function requireAdmin(req, res) {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Unauthorised' }); return null; }
  if (!process.env.ADMIN_EMAIL || user.email !== process.env.ADMIN_EMAIL) {
    res.status(403).json({ error: 'Forbidden' }); return null;
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { filename, contentType } = req.body ?? {};
  if (!filename) return res.status(400).json({ error: 'filename required' });

  const supabase = createServiceClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(filename);

  if (error) return res.status(500).json({ error: error.message });

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  res.json({ signedUrl: data.signedUrl, path: data.path, token: data.token, publicUrl });
}
