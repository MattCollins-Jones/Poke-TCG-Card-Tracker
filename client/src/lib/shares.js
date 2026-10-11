import { useEffect, useState } from 'react';
import { apiFetch } from './apiFetch.js';

/**
 * Tiny client-side store for the signed-in user's share links so that the
 * Share buttons, Sets grid, and Share Links page all show the same state
 * without each firing their own request.
 */
let cache = null;
let inflight = null;
const listeners = new Set();

function emit() { listeners.forEach((fn) => fn(cache)); }

async function parse(r) {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

export function loadShares(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight) {
    inflight = apiFetch('/api/collection/shares')
      .then(parse)
      .then((rows) => { cache = Array.isArray(rows) ? rows : []; emit(); return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

function upsert(share) {
  cache = [share, ...(cache ?? []).filter((s) => s.id !== share.id)];
  emit();
  return share;
}

export async function createShare({ type, set_id, title }) {
  return upsert(await parse(await apiFetch('/api/collection/shares', {
    method: 'POST',
    body: JSON.stringify({ type, set_id, title }),
  })));
}

export async function updateShare(id, patch) {
  return upsert(await parse(await apiFetch('/api/collection/shares', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...patch }),
  })));
}

export async function deleteShare(id) {
  await parse(await apiFetch(`/api/collection/shares?share_id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
  cache = (cache ?? []).filter((s) => s.id !== id);
  emit();
}

export function findShare(shares, type, setId = null) {
  return (shares ?? []).find((s) => s.type === type && (type === 'wishlist' || s.set_id === setId)) ?? null;
}

export function shareUrl(share) {
  return `${window.location.origin}/share/${share.slug}`;
}

/** Returns { shares, loading, error, reload } and stays in sync across components. */
export function useShares() {
  const [shares, setShares] = useState(cache);
  const [error, setError] = useState('');

  useEffect(() => {
    listeners.add(setShares);
    loadShares().catch((e) => setError(e.message));
    return () => { listeners.delete(setShares); };
  }, []);

  return {
    shares: shares ?? [],
    loading: shares === null && !error,
    error,
    reload: () => loadShares(true).catch((e) => setError(e.message)),
  };
}
