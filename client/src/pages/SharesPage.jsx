import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShares, shareUrl } from '../lib/shares.js';
import { useDigitalFilter } from '../context/DigitalFilterContext.jsx';
import { ShareDialog } from '../components/ShareButton.jsx';
import SetImage from '../components/SetImage.jsx';

/** One place to see and manage every public share link the user has created. */
export default function SharesPage() {
  const { shares, loading, error } = useShares();
  const { sets } = useDigitalFilter();
  const [managing, setManaging] = useState(null); // { type, setId, defaultTitle }
  const [copiedId, setCopiedId] = useState(null);

  const setMap = useMemo(() => Object.fromEntries((sets ?? []).map((s) => [s.id, s])), [sets]);

  const rows = useMemo(() => shares.map((s) => {
    const set = s.type === 'set_missing' ? setMap[s.set_id] : null;
    const defaultTitle = s.type === 'wishlist' ? 'Wishlist' : `${set?.name ?? s.set_id} — cards still needed`;
    return { ...s, set, defaultTitle, displayTitle: s.title || defaultTitle };
  }), [shares, setMap]);

  const live = rows.filter((r) => r.enabled).length;

  const copy = async (row) => {
    try {
      await navigator.clipboard.writeText(shareUrl(row));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore — user can open the dialog and copy manually */ }
  };

  return (
    <div>
      <h1>🔗 Share Links</h1>
      <p className="share-page-intro">
        Public pages you've created from your wishlist or individual sets. Anyone with a link can view it — no account needed.
        Turn a link off to hide it instantly, or delete it to retire the URL for good.
      </p>

      {!loading && rows.length > 0 && (
        <div className="stats-bar">
          <div className="stat-chip"><div className="stat-chip-row"><strong>{rows.length}</strong><span>{rows.length === 1 ? 'link' : 'links'}</span></div></div>
          <div className="stat-chip"><div className="stat-chip-row"><strong>{live}</strong><span>live</span></div></div>
          {rows.length - live > 0 && (
            <div className="stat-chip stat-chip-muted"><div className="stat-chip-row"><strong>{rows.length - live}</strong><span>turned off</span></div></div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <span className="emoji">🔗</span>
          <p>You haven't shared anything yet.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>
            Use the <strong>🔗 Share</strong> button on your <Link to="/wishlist">Wishlist</Link> or on any set's card list to create a public link.
          </p>
        </div>
      ) : (
        <ul className="share-list">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`share-list-item${row.enabled ? '' : ' off'}`}
              onClick={() => setManaging({ type: row.type, setId: row.set_id, defaultTitle: row.set?.name ?? row.set_id })}
            >
              <div className="share-list-icon">
                {row.type === 'wishlist'
                  ? <span className="share-list-emoji">⭐</span>
                  : <SetImage set={row.set ?? { id: row.set_id }} preferSymbol noDefault style={{ height: 28 }} />}
              </div>
              <div className="share-list-main">
                <div className="share-list-title">{row.displayTitle}</div>
                <div className="share-list-meta">
                  <span className={`share-list-badge ${row.type}`}>{row.type === 'wishlist' ? 'Wishlist' : 'Missing from set'}</span>
                  {row.set && <span>{row.set.name}</span>}
                  <span>Created {new Date(row.created_at).toLocaleDateString()}</span>
                </div>
                <div className="share-list-url">{shareUrl(row)}</div>
              </div>
              <div className="share-list-actions" onClick={(e) => e.stopPropagation()}>
                <span className={`share-status-pill${row.enabled ? ' on' : ' off'}`}>
                  <span className="share-status-dot" />{row.enabled ? 'Live' : 'Off'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(row)} disabled={!row.enabled}>
                  {copiedId === row.id ? '✓ Copied' : 'Copy'}
                </button>
                <a className="btn btn-ghost btn-sm" href={shareUrl(row)} target="_blank" rel="noreferrer">Open</a>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setManaging({ type: row.type, setId: row.set_id, defaultTitle: row.set?.name ?? row.set_id })}
                >
                  Manage
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {managing && (
        <ShareDialog
          type={managing.type}
          setId={managing.setId}
          defaultTitle={managing.defaultTitle}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
