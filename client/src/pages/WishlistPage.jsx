import { useState, useEffect, useCallback } from 'react';
import CardModal from '../components/CardModal.jsx';
import { apiFetch } from '../lib/apiFetch.js';

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  const loadWishlist = useCallback(() => {
    apiFetch('/api/collection?wishlist=true')
      .then((r) => r.json())
      .then((rows) => { setWishlist(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadWishlist(); }, [loadWishlist]);

  const filtered = wishlist.filter((e) =>
    !search || e.card_name.toLowerCase().includes(search.toLowerCase())
  );

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
    loadWishlist();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: 'DELETE' });
    loadWishlist();
  };

  const handleAdjust = async (entry, delta) => {
    const newQty = entry.quantity + delta;
    if (newQty <= 0) {
      await apiFetch(`/api/collection/${entry.id}`, { method: 'DELETE' });
    } else {
      await apiFetch(`/api/collection/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty, condition: entry.condition, wishlist: entry.wishlist, notes: entry.notes }),
      });
    }
    loadWishlist();
  };

  if (loading) return <div className="loading">Loading wishlist…</div>;

  return (
    <div>
      <h1>⭐ Wishlist</h1>

      {wishlist.length === 0 ? (
        <div className="empty-state">
          <span className="emoji">⭐</span>
          Your wishlist is empty. Browse sets and mark cards you want!
        </div>
      ) : (
        <>
          <div className="stats-bar">
            <div className="stat-chip"><strong>{wishlist.length}</strong> cards wanted</div>
          </div>

          <div className="filter-bar">
            <input
              className="search-input"
              type="text"
              placeholder="Search wishlist…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                    className="card-item wishlist"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    {entry.card_image ? (
                      <img src={entry.card_image} alt={entry.card_name} loading="lazy" />
                    ) : (
                      <div style={{ aspectRatio: '63/88', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {entry.card_name}
                      </div>
                    )}
                    <span className="card-badge wishlist">★</span>
                    <div className="card-item-info">
                      <div className="card-item-name">{entry.card_name}</div>
                      <div className="card-item-number">#{entry.card_number}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <span className="emoji">🔍</span>
              No cards match your search.
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
          collectionEntries={[selectedEntry]}
          onClose={() => setSelectedEntry(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdjust={handleAdjust}
        />
      )}
    </div>
  );
}
