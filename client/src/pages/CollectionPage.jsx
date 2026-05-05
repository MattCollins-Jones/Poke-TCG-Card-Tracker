import { useState, useEffect, useCallback } from 'react';
import CardModal from '../components/CardModal.jsx';
import { apiFetch } from '../lib/apiFetch.js';

const CONDITIONS = ['mint', 'good', 'played', 'poor'];

export default function CollectionPage() {
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCondition, setFilterCondition] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  const loadCollection = useCallback(() => {
    apiFetch('/api/collection?wishlist=false')
      .then((r) => r.json())
      .then((rows) => { setCollection(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  const filtered = collection.filter((e) => {
    if (filterCondition !== 'all' && e.condition !== filterCondition) return false;
    if (search && !e.card_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by set
  const grouped = filtered.reduce((acc, entry) => {
    const key = entry.set_id;
    if (!acc[key]) acc[key] = { name: entry.set_name, entries: [] };
    acc[key].entries.push(entry);
    return acc;
  }, {});

  const handleSave = async (payload) => {
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    loadCollection();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: 'DELETE' });
    loadCollection();
  };

  if (loading) return <div className="loading">Loading collection…</div>;

  const totalCards = collection.reduce((sum, e) => sum + e.quantity, 0);
  const uniqueCards = collection.length;

  return (
    <div>
      <h1>My Collection</h1>

      {collection.length === 0 ? (
        <div className="empty-state">
          <span className="emoji">📦</span>
          Your collection is empty. Browse sets and add cards!
        </div>
      ) : (
        <>
          <div className="stats-bar">
            <div className="stat-chip"><strong>{uniqueCards}</strong> unique cards</div>
            <div className="stat-chip"><strong>{totalCards}</strong> total copies</div>
            <div className="stat-chip"><strong>{Object.keys(grouped).length}</strong> sets</div>
          </div>

          <div className="filter-bar">
            <input
              className="search-input"
              type="text"
              placeholder="Search your collection…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className={`filter-btn${filterCondition === 'all' ? ' active' : ''}`} onClick={() => setFilterCondition('all')}>All</button>
            {CONDITIONS.map((c) => (
              <button key={c} className={`filter-btn${filterCondition === c ? ' active' : ''}`} onClick={() => setFilterCondition(c)}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>

          {Object.entries(grouped).map(([setId, group]) => (
            <div key={setId} className="collection-set-group">
              <div className="collection-set-header">
                <h2>{group.name}</h2>
                <span className="progress-label">{group.entries.length} cards</span>
              </div>
              <div className="cards-grid">
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="card-item owned"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    {entry.card_image ? (
                      <img src={entry.card_image} alt={entry.card_name} loading="lazy" />
                    ) : (
                      <div style={{ aspectRatio: '63/88', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {entry.card_name}
                      </div>
                    )}
                    <span className="card-badge owned">×{entry.quantity}</span>
                    <div className="card-item-info">
                      <div className="card-item-name">{entry.card_name}</div>
                      <div className="card-item-number">#{entry.card_number} · {entry.condition}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <span className="emoji">🔍</span>
              No cards match this filter.
            </div>
          )}
        </>
      )}

      {selectedEntry && (
        <CardModal
          card={{
            id: selectedEntry.card_id,
            name: selectedEntry.card_name,
            number: selectedEntry.card_number,
            rarity: selectedEntry.rarity,
            images: { small: selectedEntry.card_image },
            set: { id: selectedEntry.set_id, name: selectedEntry.set_name },
          }}
          collectionEntry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
