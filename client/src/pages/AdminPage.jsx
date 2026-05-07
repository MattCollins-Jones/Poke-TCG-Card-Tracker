import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

// ── Sets Admin Tab ────────────────────────────────────────────────────────────

function SetsAdmin() {
  const [sets, setSets] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});
  const [feedback, setFeedback] = useState({});

  useEffect(() => {
    apiFetch('/api/sets').then(r => r.json()).then(d => {
      setSets(d.data ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = sets.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.series ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const getEdit = (id, field, fallback) =>
    edits[id]?.[field] !== undefined ? edits[id][field] : (fallback ?? '');

  const setEdit = (id, field, value) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));

  const save = async (set) => {
    const patch = edits[set.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving(prev => ({ ...prev, [set.id]: true }));
    try {
      const res = await apiFetch(`/api/admin/sets/${set.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patch.name ?? set.name,
          series: patch.series ?? set.series,
          logo_image: patch.logo_image ?? set.images?.logo,
          symbol_image: patch.symbol_image ?? set.images?.symbol,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Apply edits to local state
      setSets(prev => prev.map(s => s.id !== set.id ? s : {
        ...s,
        name: patch.name ?? s.name,
        series: patch.series ?? s.series,
        images: {
          logo: patch.logo_image ?? s.images?.logo,
          symbol: patch.symbol_image ?? s.images?.symbol,
        },
      }));
      setEdits(prev => { const n = { ...prev }; delete n[set.id]; return n; });
      setFeedback(prev => ({ ...prev, [set.id]: 'saved' }));
      setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[set.id]; return n; }), 2000);
    } catch (e) {
      setFeedback(prev => ({ ...prev, [set.id]: `Error: ${e.message}` }));
    }
    setSaving(prev => ({ ...prev, [set.id]: false }));
  };

  if (loading) return <div className="loading">Loading sets…</div>;

  return (
    <div>
      <input
        className="search-input"
        placeholder="Search sets…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16 }}
      />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
        {filtered.length} sets · Edit logo/symbol URLs or name/series inline, then click Save.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>ID</th>
              <th>Name</th>
              <th>Series</th>
              <th>Logo URL</th>
              <th>Symbol URL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(set => (
              <tr key={set.id}>
                <td className="admin-preview">
                  {(edits[set.id]?.logo_image ?? set.images?.logo) ? (
                    <img src={edits[set.id]?.logo_image ?? set.images?.logo} alt="" onError={e => e.target.style.display='none'} />
                  ) : (edits[set.id]?.symbol_image ?? set.images?.symbol) ? (
                    <img src={edits[set.id]?.symbol_image ?? set.images?.symbol} alt="" onError={e => e.target.style.display='none'} />
                  ) : <span className="admin-no-img">–</span>}
                </td>
                <td className="admin-id">{set.id}</td>
                <td>
                  <input
                    className="admin-input"
                    value={getEdit(set.id, 'name', set.name)}
                    onChange={e => setEdit(set.id, 'name', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="admin-input"
                    value={getEdit(set.id, 'series', set.series ?? '')}
                    onChange={e => setEdit(set.id, 'series', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="admin-input admin-url-input"
                    value={getEdit(set.id, 'logo_image', set.images?.logo ?? '')}
                    onChange={e => setEdit(set.id, 'logo_image', e.target.value)}
                    placeholder="https://…"
                  />
                </td>
                <td>
                  <input
                    className="admin-input admin-url-input"
                    value={getEdit(set.id, 'symbol_image', set.images?.symbol ?? '')}
                    onChange={e => setEdit(set.id, 'symbol_image', e.target.value)}
                    placeholder="https://…"
                  />
                </td>
                <td className="admin-actions">
                  {feedback[set.id] ? (
                    <span className={feedback[set.id] === 'saved' ? 'admin-ok' : 'admin-err'}>
                      {feedback[set.id] === 'saved' ? '✓ Saved' : feedback[set.id]}
                    </span>
                  ) : (
                    <button
                      className="btn-primary admin-save-btn"
                      onClick={() => save(set)}
                      disabled={saving[set.id] || !edits[set.id]}
                    >
                      {saving[set.id] ? '…' : 'Save'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cards Admin Tab ───────────────────────────────────────────────────────────

function CardsAdmin() {
  const [sets, setSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState('');
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});
  const [feedback, setFeedback] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    apiFetch('/api/sets').then(r => r.json()).then(d => setSets(d.data ?? []));
  }, []);

  useEffect(() => {
    if (!selectedSet) { setCards([]); return; }
    setLoadingCards(true);
    setCards([]);
    setEdits({});
    apiFetch(`/api/cards/${selectedSet}`)
      .then(r => r.json())
      .then(d => { setCards(d.data ?? []); setLoadingCards(false); })
      .catch(() => setLoadingCards(false));
  }, [selectedSet]);

  const filtered = cards.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.number?.toString().includes(search)
  );

  const getEdit = (id, field, fallback) =>
    edits[id]?.[field] !== undefined ? edits[id][field] : (fallback ?? '');

  const setEdit = (id, field, value) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));

  const save = async (card) => {
    const patch = edits[card.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving(prev => ({ ...prev, [card.id]: true }));
    try {
      const res = await apiFetch(`/api/admin/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCards(prev => prev.map(c => c.id !== card.id ? c : { ...c, ...patch }));
      setEdits(prev => { const n = { ...prev }; delete n[card.id]; return n; });
      setFeedback(prev => ({ ...prev, [card.id]: 'saved' }));
      setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[card.id]; return n; }), 2000);
    } catch (e) {
      setFeedback(prev => ({ ...prev, [card.id]: `Error: ${e.message}` }));
    }
    setSaving(prev => ({ ...prev, [card.id]: false }));
  };

  const deleteCard = async (card) => {
    setSaving(prev => ({ ...prev, [card.id]: true }));
    try {
      const res = await apiFetch(`/api/admin/cards/${card.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCards(prev => prev.filter(c => c.id !== card.id));
    } catch (e) {
      setFeedback(prev => ({ ...prev, [card.id]: `Error: ${e.message}` }));
      setSaving(prev => ({ ...prev, [card.id]: false }));
    }
    setConfirmDelete(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          className="filter-select"
          value={selectedSet}
          onChange={e => { setSelectedSet(e.target.value); setSearch(''); }}
          style={{ minWidth: 220 }}
        >
          <option value="">— Select a set —</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {selectedSet && (
          <input
            className="search-input"
            placeholder="Search cards in set…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
        )}
      </div>

      {loadingCards && <div className="loading">Loading cards…</div>}

      {!selectedSet && !loadingCards && (
        <div className="empty-state"><span className="emoji">🃏</span>Select a set to manage its cards.</div>
      )}

      {selectedSet && !loadingCards && cards.length > 0 && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            {filtered.length} cards · Edit inline then click Save, or Delete to remove.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>#</th>
                  <th>Name</th>
                  <th>Rarity</th>
                  <th>Small image URL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => (
                  <tr key={card.id}>
                    <td className="admin-preview">
                      {(edits[card.id]?.small_image ?? card.images?.small) ? (
                        <img src={edits[card.id]?.small_image ?? card.images?.small} alt="" onError={e => e.target.style.display='none'} />
                      ) : <span className="admin-no-img">–</span>}
                    </td>
                    <td className="admin-id">{card.number}</td>
                    <td>
                      <input
                        className="admin-input"
                        value={getEdit(card.id, 'name', card.name ?? '')}
                        onChange={e => setEdit(card.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        value={getEdit(card.id, 'rarity', card.rarity ?? '')}
                        onChange={e => setEdit(card.id, 'rarity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-url-input"
                        value={getEdit(card.id, 'small_image', card.images?.small ?? '')}
                        onChange={e => setEdit(card.id, 'small_image', e.target.value)}
                        placeholder="https://…"
                      />
                    </td>
                    <td className="admin-actions">
                      {feedback[card.id] ? (
                        <span className={feedback[card.id] === 'saved' ? 'admin-ok' : 'admin-err'}>
                          {feedback[card.id] === 'saved' ? '✓' : '✗'}
                        </span>
                      ) : confirmDelete === card.id ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-danger admin-save-btn" onClick={() => deleteCard(card)} disabled={saving[card.id]}>Confirm</button>
                          <button className="btn-secondary admin-save-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn-primary admin-save-btn"
                            onClick={() => save(card)}
                            disabled={saving[card.id] || !edits[card.id]}
                          >
                            {saving[card.id] ? '…' : 'Save'}
                          </button>
                          <button
                            className="btn-danger admin-save-btn"
                            onClick={() => setConfirmDelete(card.id)}
                          >🗑</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Admin Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState('sets');

  return (
    <div>
      <h1>⚙️ Admin</h1>
      <div className="admin-tabs">
        <button
          className={`admin-tab${tab === 'sets' ? ' active' : ''}`}
          onClick={() => setTab('sets')}
        >Sets</button>
        <button
          className={`admin-tab${tab === 'cards' ? ' active' : ''}`}
          onClick={() => setTab('cards')}
        >Cards</button>
      </div>
      <div style={{ marginTop: 20 }}>
        {tab === 'sets' ? <SetsAdmin /> : <CardsAdmin />}
      </div>
    </div>
  );
}
