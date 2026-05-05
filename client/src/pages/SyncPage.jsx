import { useState, useEffect, useRef } from 'react';

export default function SyncPage() {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = () => {
    fetch('/api/sync/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  const startSync = async () => {
    setTriggering(true);
    await fetch('/api/sync/start', { method: 'POST' });
    setTriggering(false);
    fetchStatus();
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>🔄 Data Sync</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Syncing downloads all Pokémon TCG sets and cards into your local database so the app
        works offline and loads instantly. A sync runs automatically on first startup and every 7 days.
      </p>

      {status && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="stat-chip">
              <strong>{status.lastSync ? new Date(status.lastSync + 'Z').toLocaleString() : 'Never'}</strong>
              {' '}last sync
            </div>
            <div className="stat-chip" style={{ borderColor: status.inProgress ? 'var(--yellow)' : undefined }}>
              <strong style={{ color: status.inProgress ? 'var(--yellow)' : status.needsSync ? '#ef5350' : '#4caf50' }}>
                {status.inProgress ? '⏳ In progress' : status.needsSync ? '⚠️ Needs sync' : '✅ Up to date'}
              </strong>
            </div>
          </div>

          {status.log?.length > 0 && (
            <div style={{
              background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
              fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)',
              maxHeight: 160, overflowY: 'auto'
            }}>
              {status.log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={startSync}
        disabled={triggering || status?.inProgress}
      >
        {status?.inProgress ? '⏳ Syncing…' : '🔄 Start Sync Now'}
      </button>
    </div>
  );
}
