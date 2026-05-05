import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

export default function SyncPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const runPhase = async (phase) => {
    setRunning(true);
    setDone(false);
    setHasMore(false);
    if (phase === 'auto') setLog(['Starting sync…']);
    else setLog((prev) => [...prev, `--- Continuing (${phase}) ---`]);

    try {
      const res = await apiFetch(`/api/sync?phase=${phase}`, { method: 'POST' });
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      setLog((prev) => [...prev, ...lines]);
      setHasMore(lines.some((l) => l.includes('remaining')));
      setDone(!lines.some((l) => l.includes('remaining')));
    } catch (err) {
      setLog((prev) => [...prev, `Error: ${err.message}`]);
    }

    setRunning(false);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>🔄 Data Sync</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Syncing downloads all Pokémon TCG sets and cards into the shared database.
        Cards are synced in batches — click <strong>Continue</strong> after each batch until complete.
        The sync runs automatically once a month to pick up new sets.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => runPhase('auto')} disabled={running}>
          {running ? '⏳ Syncing…' : '🔄 Start Sync'}
        </button>
        {hasMore && !running && (
          <button className="btn btn-primary" onClick={() => runPhase('cards')} disabled={running}>
            ▶ Continue Next Batch
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20 }}>
          {done && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: '#4caf50' }}>
              ✅ Sync complete
            </div>
          )}
          {hasMore && !running && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--yellow)' }}>
              ⏳ More cards to sync — click <strong>Continue Next Batch</strong>
            </div>
          )}
          <div style={{
            background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
            fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)',
            maxHeight: 300, overflowY: 'auto'
          }}>
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}


