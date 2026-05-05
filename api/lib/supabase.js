import { createClient } from '@supabase/supabase-js';

// Public client — uses anon key, respects Row Level Security
export function createSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Service client — bypasses RLS, used only for sync (admin operations)
export function createServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// Validate Bearer token from request, return user or null
export async function getUser(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Require auth — returns user or sends 401
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }
  return user;
}
