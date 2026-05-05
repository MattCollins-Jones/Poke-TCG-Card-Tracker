import { supabase } from '../lib/supabase.js';

/**
 * Wrapper around fetch() that automatically attaches the Supabase auth token.
 * Usage: apiFetch('/api/collection') — identical to fetch() but auth-aware.
 */
export async function apiFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return fetch(url, { ...options, headers });
}
