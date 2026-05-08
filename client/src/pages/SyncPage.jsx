import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

export default function SyncPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasPriceMore, setHasPriceMore] = useState(false);

  const runPhase = async (phase) => {
    setRunning(true);
    setDone(false);
    setHasMore(false);
    if (phase === 'auto') setLog(['Starting sync…']);
    else if (phase === 'prices') setLog((prev) => [...prev, '--- Starting price sync ---']);
    else setLog((prev) => [...prev, `--- Continuing (${phase}) ---`]);

    try {
      const res = await apiFetch(`/api/sync?phase=${phase}`, { method: 'POST' });
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      setLog((prev) => [...prev, ...lines]);

      const hasRemaining = lines.some((l) => l.includes('remaining'));
      if (phase === 'prices') {
        setHasPriceMore(hasRemaining);
      } else {
        setHasMore(hasRemaining);
      }
      setDone(!hasRemaining && phase !== 'prices');
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

      <hr style={{ border: 'none', borderTop: '1px solid var(--surface2)', margin: '20px 0' }} />

      <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>💰 Price Sync</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 14 }}>
        Fetches Cardmarket and TCGPlayer market prices for every card.
        Run this weekly — prices do not update automatically.
        Runs in batches like the card sync.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => runPhase('prices')} disabled={running}>
          {running ? '⏳ Syncing…' : '💰 Sync Prices'}
        </button>
        {hasPriceMore && !running && (
          <button className="btn btn-secondary" onClick={() => runPhase('prices')} disabled={running}>
            ▶ Continue Price Batch
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20, marginTop: 20 }}>
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
          {hasPriceMore && !running && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--yellow)' }}>
              ⏳ More prices to sync — click <strong>Continue Price Batch</strong>
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

