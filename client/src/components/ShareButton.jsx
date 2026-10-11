import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

/**
 * "Share" button + dialog for a single share target (the wishlist, or the
 * missing cards of one set). Creates the link on demand, lets the owner copy it,
 * turn it off/on, rename it, or delete it.
 */
export default function ShareButton({ type, setId = null, defaultTitle, className = 'filter-btn' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} title="Create a public link to this page">
        🔗 Share
      </button>
      {open && (
        <ShareDialog type={type} setId={setId} defaultTitle={defaultTitle} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ShareDialog({ type, setId, defaultTitle, onClose }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    apiFetch('/api/collection/shares')
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error(rows?.error ?? 'Failed to load shares');
        const found = rows.find((s) => s.type === type && (type === 'wishlist' || s.set_id === setId)) ?? null;
        setShare(found);
        setTitle(found?.title ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, setId]);

  const url = share ? `${window.location.origin}/share/${share.slug}` : '';

  const call = async (fn) => {
    setBusy(true); setError(''); setCopied(false);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const parse = async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };

  const create = () => call(async () => {
    const body = await parse(await apiFetch('/api/collection/shares', {
      method: 'POST',
      body: JSON.stringify({ type, set_id: setId, title }),
    }));
    setShare(body);
    setTitle(body.title ?? '');
  });

  const toggle = () => call(async () => {
    setShare(await parse(await apiFetch('/api/collection/shares', {
      method: 'PATCH',
      body: JSON.stringify({ id: share.id, enabled: !share.enabled }),
    })));
  });

  const saveTitle = () => call(async () => {
    setShare(await parse(await apiFetch('/api/collection/shares', {
      method: 'PATCH',
      body: JSON.stringify({ id: share.id, title }),
    })));
  });

  const remove = () => call(async () => {
    await parse(await apiFetch(`/api/collection/shares?share_id=${encodeURIComponent(share.id)}`, { method: 'DELETE' }));
    setShare(null);
    setTitle('');
    setConfirmDelete(false);
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link and copy it manually.');
    }
  };

  const titleDirty = share && (title.trim() || null) !== (share.title ?? null);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog">
        <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        <h2 className="share-dialog-title">🔗 Share {type === 'wishlist' ? 'your wishlist' : 'missing cards'}</h2>
        <p className="share-dialog-desc">
          {type === 'wishlist'
            ? 'Anyone with the link can see the cards on your wishlist and which versions you want.'
            : `Anyone with the link can see which cards and versions you still need from ${defaultTitle ?? 'this set'}.`}
          {' '}No account needed. The page shows your live collection — only you can change it. Your email is never shown.
        </p>

        {loading ? (
          <div className="loading" style={{ padding: 24 }}>Loading…</div>
        ) : !share ? (
          <>
            <div className="form-group">
              <label>Page title (optional)</label>
              <input
                className="form-control"
                type="text"
                maxLength={80}
                placeholder={type === 'wishlist' ? "e.g. Matt's wishlist" : `e.g. ${defaultTitle ?? 'Set'} — cards I need`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
            </div>
          </>
        ) : (
          <>
            <div className={`share-status${share.enabled ? ' on' : ' off'}`}>
              <span className="share-status-dot" />
              {share.enabled ? 'Link is live' : 'Link is turned off — visitors see "unavailable"'}
              <label className="share-switch" title={share.enabled ? 'Turn link off' : 'Turn link on'}>
                <input type="checkbox" checked={share.enabled} onChange={toggle} disabled={busy} />
                <span />
              </label>
            </div>

            <div className="form-group">
              <label>Link</label>
              <div className="share-url-row">
                <input className="form-control share-url" type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
                <button className="btn btn-primary btn-sm" onClick={copy} disabled={!share.enabled}>{copied ? '✓ Copied' : 'Copy'}</button>
                <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>

            <div className="form-group">
              <label>Page title</label>
              <div className="share-url-row">
                <input
                  className="form-control"
                  type="text"
                  maxLength={80}
                  placeholder={type === 'wishlist' ? 'Wishlist' : `${defaultTitle ?? 'Set'} — cards still needed`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button className="btn btn-ghost btn-sm" onClick={saveTitle} disabled={busy || !titleDirty}>Save</button>
              </div>
            </div>

            <p className="share-dialog-note">
              Changes you make to your collection appear on the page within about a minute.
            </p>

            <div className="modal-actions share-dialog-actions">
              {confirmDelete ? (
                <>
                  <span className="share-dialog-confirm">Delete this link? The URL will stop working for good.</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                  <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete</button>
                </>
              ) : (
                <>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete link</button>
                  <button className="btn btn-ghost" onClick={onClose}>Done</button>
                </>
              )}
            </div>
          </>
        )}

        {error && <div className="share-dialog-error">{error}</div>}
      </div>
    </div>
  );
}
