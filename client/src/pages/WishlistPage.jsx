import { useState, useEffect, useCallback } from 'react';
import CardModal from '../components/CardModal.jsx';
import { apiFetch } from '../lib/apiFetch.js';
import { FINISH_LABELS_SHORT, FINISH_TO_VARIANT_KEY } from '../utils/finishes.js';

function variantsFromEntries(entries) {
  const v = {};
  entries.forEach((e) => {
    const key = FINISH_TO_VARIANT_KEY[e.finish];
    if (key) v[key] = true;
  });
  return v;
}

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);

  const loadWishlist = useCallback(() => {
    return apiFetch('/api/collection?wishlist=true')
      .then((r) => r.json())
      .then((rows) => { setWishlist(rows); setLoading(false); return rows; })
      .catch(() => { setLoading(false); return []; });
  }, []);

  useEffect(() => { loadWishlist(); }, [loadWishlist]);

  const syncSelectedCard = (rows) => {
    setSelectedCard((prev) => {
      if (!prev) return null;
      const updatedEntries = rows.filter((e) => e.card_id === prev.id);
      if (updatedEntries.length === 0) return null;
      return { ...prev, entries: updatedEntries };
    });
  };

  const filtered = wishlist.filter((e) =>
    !search || e.card_name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, entry) => {
    const setKey = entry.set_id;
    if (!acc[setKey]) acc[setKey] = { name: entry.set_name, cards: {} };
    const cardKey = entry.card_id;
    if (!acc[setKey].cards[cardKey]) {
      acc[setKey].cards[cardKey] = {
        id: entry.card_id,
        name: entry.card_name,
        number: entry.card_number,
        rarity: entry.rarity,
        image: entry.card_image,
        set_id: entry.set_id,
        set_name: entry.set_name,
        entries: [],
      };
    }
    acc[setKey].cards[cardKey].entries.push(entry);
    return acc;
  }, {});

  const handleSave = async (payload) => {
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const rows = await loadWishlist();
    syncSelectedCard(rows);
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: 'DELETE' });
    const rows = await loadWishlist();
    syncSelectedCard(rows);
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
    const rows = await loadWishlist();
    syncSelectedCard(rows);
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
                <span className="progress-label">{Object.keys(group.cards).length} cards</span>
              </div>
              <div className="cards-grid">
                {Object.values(group.cards).map((cardGroup) => (
                  <div
                    key={cardGroup.id}
                    className="card-item wishlist"
                    onClick={() => setSelectedCard(cardGroup)}
                  >
                    {cardGroup.image ? (
                      <img src={cardGroup.image} alt={cardGroup.name} loading="lazy" />
                    ) : (
                      <div style={{ aspectRatio: '63/88', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {cardGroup.name}
                      </div>
                    )}
                    <span className="card-badge wishlist">★</span>
                    <div className="finish-hover-panel" onClick={(e) => e.stopPropagation()}>
                      {cardGroup.entries.map((entry) => (
                        <div key={entry.id} className="fhp-wish-row">
                          <span className="fhp-wish-badge">★{FINISH_LABELS_SHORT[entry.finish] ?? entry.finish}</span>
                          <button
                            className="fhp-remove-btn"
                            title="Remove from wishlist"
                            onClick={async (ev) => { ev.stopPropagation(); await handleDelete(entry.id); }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="card-item-info">
                      <div className="card-item-name">{cardGroup.name}</div>
                      <div className="card-item-number">#{cardGroup.number}</div>
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

      {selectedCard && (
        <CardModal
          card={{
            id: selectedCard.id,
            name: selectedCard.name,
            number: selectedCard.number,
            rarity: selectedCard.rarity,
            images: { small: selectedCard.image },
            set: { id: selectedCard.set_id, name: selectedCard.set_name },
            variants: variantsFromEntries(selectedCard.entries),
          }}
          collectionEntries={selectedCard.entries}
          onClose={() => setSelectedCard(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdjust={handleAdjust}
        />
      )}
    </div>
  );
}
