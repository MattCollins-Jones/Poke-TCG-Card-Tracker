import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch.js';
import ImageUpload from '../components/ImageUpload.jsx';

// ── Shared toggle helper ──────────────────────────────────────────────────────

async function toggleHidden(endpoint, id, currentHidden, setItems, setToggling) {
  setToggling(prev => ({ ...prev, [id]: true }));
  try {
    const res = await apiFetch(`${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !currentHidden }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setItems(prev => prev.map(item => item.id !== id ? item : { ...item, hidden: !currentHidden }));
  } catch (e) {
    alert(`Failed to update visibility: ${e.message}`);
  }
  setToggling(prev => ({ ...prev, [id]: false }));
}

const EMPTY_SET = { id: '', name: '', series: '', release_date: '', total: '', logo_image: '', symbol_image: '' };
const EMPTY_CARD = { id: '', name: '', number: '', rarity: '', small_image: '', large_image: '' };

// ── Add Set Form ──────────────────────────────────────────────────────────────

function AddSetForm({ onAdded }) {
  const [form, setForm] = useState(EMPTY_SET);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id || !form.name) { setError('ID and Name are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setForm(EMPTY_SET);
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="admin-add-section">
      <button className="admin-add-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Add New Set
      </button>
      {open && (
        <form className="admin-add-form" onSubmit={handleSubmit}>
          <div className="admin-add-grid">
            <label>
              Set ID <span className="admin-required">*</span>
              <input className="admin-input" value={form.id} onChange={e => setField('id', e.target.value)} placeholder="e.g. custom-promos-2024" required />
              <span className="admin-hint">Lowercase slug, must be unique</span>
            </label>
            <label>
              Name <span className="admin-required">*</span>
              <input className="admin-input" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Set name" required />
            </label>
            <label>
              Series
              <input className="admin-input" value={form.series} onChange={e => setField('series', e.target.value)} placeholder="e.g. Scarlet & Violet" />
            </label>
            <label>
              Release Date
              <input className="admin-input" type="date" value={form.release_date} onChange={e => setField('release_date', e.target.value)} />
            </label>
            <label>
              Total Cards
              <input className="admin-input" type="number" min="0" value={form.total} onChange={e => setField('total', e.target.value)} placeholder="0" />
            </label>
          </div>
          <div className="admin-add-images">
            <label>
              Logo Image
              <ImageUpload value={form.logo_image} onChange={v => setField('logo_image', v)} folder="sets/logos" showPreview />
            </label>
            <label>
              Symbol Image
              <ImageUpload value={form.symbol_image} onChange={v => setField('symbol_image', v)} folder="sets/symbols" showPreview />
            </label>
          </div>
          {error && <div className="admin-err">{error}</div>}
          <div className="admin-add-actions">
            <button type="submit" className="btn-primary admin-save-btn" disabled={saving}>
              {saving ? 'Adding…' : '+ Add Set'}
            </button>
            <button type="button" className="btn-secondary admin-save-btn" onClick={() => { setOpen(false); setForm(EMPTY_SET); setError(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Add Card Form ─────────────────────────────────────────────────────────────

function AddCardForm({ sets, defaultSetId, onAdded }) {
  const [form, setForm] = useState({ ...EMPTY_CARD, set_id: defaultSetId ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (defaultSetId) setForm(prev => ({ ...prev, set_id: defaultSetId }));
  }, [defaultSetId]);

  const setField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-suggest card ID when set or number changes
      if (field === 'set_id' || field === 'number') {
        const sid = field === 'set_id' ? value : next.set_id;
        const num = field === 'number' ? value : next.number;
        if (sid && num && !next._idManual) next.id = `${sid}-${num.replace(/\s+/g, '-')}`;
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id || !form.set_id || !form.name) { setError('ID, Set, and Name are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setForm({ ...EMPTY_CARD, set_id: form.set_id });
      setOpen(false);
      onAdded(form.set_id);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="admin-add-section">
      <button className="admin-add-toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Add New Card
      </button>
      {open && (
        <form className="admin-add-form" onSubmit={handleSubmit}>
          <div className="admin-add-grid">
            <label>
              Set <span className="admin-required">*</span>
              <select className="admin-input" value={form.set_id} onChange={e => setField('set_id', e.target.value)} required>
                <option value="">— Select set —</option>
                {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              Card Number
              <input className="admin-input" value={form.number} onChange={e => setField('number', e.target.value)} placeholder="e.g. 001 or SV01" />
            </label>
            <label>
              Card ID <span className="admin-required">*</span>
              <input
                className="admin-input"
                value={form.id}
                onChange={e => setForm(prev => ({ ...prev, id: e.target.value, _idManual: true }))}
                placeholder="e.g. custom-set-001"
                required
              />
              <span className="admin-hint">Auto-filled from Set + Number</span>
            </label>
            <label>
              Name <span className="admin-required">*</span>
              <input className="admin-input" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Card name" required />
            </label>
            <label>
              Rarity
              <input className="admin-input" value={form.rarity} onChange={e => setField('rarity', e.target.value)} placeholder="e.g. Rare Holo" />
            </label>
          </div>
          <div className="admin-add-images">
            <label>
              Card Image (small)
              <ImageUpload value={form.small_image} onChange={v => setField('small_image', v)} folder="cards/small" showPreview />
            </label>
            <label>
              Card Image (large)
              <ImageUpload value={form.large_image} onChange={v => setField('large_image', v)} folder="cards/large" showPreview />
            </label>
          </div>
          {error && <div className="admin-err">{error}</div>}
          <div className="admin-add-actions">
            <button type="submit" className="btn-primary admin-save-btn" disabled={saving}>
              {saving ? 'Adding…' : '+ Add Card'}
            </button>
            <button type="button" className="btn-secondary admin-save-btn" onClick={() => { setOpen(false); setForm({ ...EMPTY_CARD, set_id: form.set_id }); setError(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Sets Admin Tab ────────────────────────────────────────────────────────────

function SetsAdmin() {
  const [sets, setSets] = useState([]);
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [toggling, setToggling] = useState({});
  const [edits, setEdits] = useState({});
  const [feedback, setFeedback] = useState({});

  const loadSets = () => {
    setLoading(true);
    apiFetch('/api/admin/sets').then(r => r.json()).then(d => {
      setSets(d.data ?? []);
      setLoading(false);
    });
  };

  useEffect(() => { loadSets(); }, []);

  const filtered = sets.filter(s => {
    if (!showHidden && s.hidden) return false;
    return s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.series ?? '').toLowerCase().includes(search.toLowerCase());
  });

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

  const hiddenCount = sets.filter(s => s.hidden).length;

  return (
    <div>
      <AddSetForm onAdded={loadSets} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        <input
          className="search-input"
          placeholder="Search sets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} style={{ accentColor: 'var(--yellow)' }} />
          Show hidden ({hiddenCount})
        </label>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
        {filtered.length} sets · Edit inline then Save · 👁 toggles visibility
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>ID</th>
              <th>Name</th>
              <th>Series</th>
              <th>Logo</th>
              <th>Symbol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(set => (
              <tr key={set.id} style={set.hidden ? { opacity: 0.45 } : {}}>
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
                  <ImageUpload
                    value={getEdit(set.id, 'logo_image', set.images?.logo ?? '')}
                    onChange={v => setEdit(set.id, 'logo_image', v)}
                    folder="sets/logos"
                  />
                </td>
                <td>
                  <ImageUpload
                    value={getEdit(set.id, 'symbol_image', set.images?.symbol ?? '')}
                    onChange={v => setEdit(set.id, 'symbol_image', v)}
                    folder="sets/symbols"
                  />
                </td>
                <td className="admin-actions">
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      className="admin-vis-btn"
                      title={set.hidden ? 'Show set' : 'Hide set'}
                      onClick={() => toggleHidden('/api/admin/sets', set.id, set.hidden, setSets, setToggling)}
                      disabled={toggling[set.id]}
                    >
                      {set.hidden ? '🙈' : '👁'}
                    </button>
                    {feedback[set.id] ? (
                      <span className={feedback[set.id] === 'saved' ? 'admin-ok' : 'admin-err'}>
                        {feedback[set.id] === 'saved' ? '✓' : feedback[set.id]}
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
                  </span>
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
  const [showHidden, setShowHidden] = useState(true);
  const [saving, setSaving] = useState({});
  const [toggling, setToggling] = useState({});
  const [edits, setEdits] = useState({});
  const [feedback, setFeedback] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    apiFetch('/api/admin/sets').then(r => r.json()).then(d => setSets(d.data ?? []));
  }, []);

  const loadCards = (setId) => {
    if (!setId) { setCards([]); return; }
    setLoadingCards(true);
    setCards([]);
    setEdits({});
    apiFetch(`/api/admin/cards?setId=${setId}`)
      .then(r => r.json())
      .then(d => { setCards(d.data ?? []); setLoadingCards(false); })
      .catch(() => setLoadingCards(false));
  };

  useEffect(() => { loadCards(selectedSet); }, [selectedSet]);

  const filtered = cards.filter(c => {
    if (!showHidden && c.hidden) return false;
    return c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.number?.toString().includes(search);
  });

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

  const hiddenCount = cards.filter(c => c.hidden).length;

  return (
    <div>
      <AddCardForm
        sets={sets}
        defaultSetId={selectedSet}
        onAdded={(setId) => { if (setId === selectedSet) loadCards(setId); }}
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        <select
          className="filter-select"
          value={selectedSet}
          onChange={e => { setSelectedSet(e.target.value); setSearch(''); }}
          style={{ minWidth: 220 }}
        >
          <option value="">— Select a set —</option>
          {sets.map(s => <option key={s.id} value={s.id}>{s.hidden ? '🙈 ' : ''}{s.name}</option>)}
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
        {selectedSet && cards.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} style={{ accentColor: 'var(--yellow)' }} />
            Show hidden ({hiddenCount})
          </label>
        )}
      </div>

      {loadingCards && <div className="loading">Loading cards…</div>}

      {!selectedSet && !loadingCards && (
        <div className="empty-state"><span className="emoji">🃏</span>Select a set to manage its cards.</div>
      )}

      {selectedSet && !loadingCards && cards.length > 0 && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            {filtered.length} cards · 👁 toggles visibility · Edit inline then Save
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>#</th>
                  <th>Name</th>
                  <th>Rarity</th>
                  <th>Card Image</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => (
                  <tr key={card.id} style={card.hidden ? { opacity: 0.45 } : {}}>
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
                      <ImageUpload
                        value={getEdit(card.id, 'small_image', card.images?.small ?? '')}
                        onChange={v => setEdit(card.id, 'small_image', v)}
                        folder="cards/small"
                      />
                    </td>
                    <td className="admin-actions">
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                          className="admin-vis-btn"
                          title={card.hidden ? 'Show card' : 'Hide card'}
                          onClick={() => toggleHidden('/api/admin/cards', card.id, card.hidden, setCards, setToggling)}
                          disabled={toggling[card.id]}
                        >
                          {card.hidden ? '🙈' : '👁'}
                        </button>
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
                      </span>
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
