import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

export default function SyncPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const startSync = async () => {
    setRunning(true);
    setDone(false);
    setLog(['Starting sync…']);

    try {
      const res = await apiFetch('/api/sync', { method: 'POST' });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(Boolean);
        setLog((prev) => [...prev, ...lines]);
      }
    } catch (err) {
      setLog((prev) => [...prev, `Error: ${err.message}`]);
    }

    setRunning(false);
    setDone(true);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>🔄 Data Sync</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Syncing downloads all Pokémon TCG sets and cards into the shared database.
        This only needs to run once to populate data, then monthly to pick up new sets.
        The sync runs automatically once a month via a scheduled job.
      </p>

      <button
        className="btn btn-primary"
        onClick={startSync}
        disabled={running}
        style={{ marginBottom: 20 }}
      >
        {running ? '⏳ Syncing…' : '🔄 Start Sync Now'}
      </button>

      {log.length > 0 && (
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20,
        }}>
          {done && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: '#4caf50' }}>
              ✅ Sync complete
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

