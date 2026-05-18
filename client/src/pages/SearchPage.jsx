import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CardModal from '../components/CardModal.jsx';
import { getAvailableFinishes, FINISH_LABELS, FINISH_LABELS_SHORT } from '../utils/finishes.js';
import { apiFetch } from '../lib/apiFetch.js';

function getRarityColor(rarity) {
  if (!rarity) return null;
  const r = rarity.toLowerCase();
  if (r.includes('special illustration')) return 'rarity-sir';
  if (r.includes('hyper') || r.includes('rainbow')) return 'rarity-hyper';
  if (r.includes('illustration rare')) return 'rarity-ir';
  if (r.includes('ultra') || r.includes('secret') || r.includes('ace spec')) return 'rarity-ultra';
  if (r.includes('double rare') || r.includes('rare holo')) return 'rarity-holo';
  if (r.includes('rare')) return 'rarity-rare';
  return null;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Lightweight owned/wishlist map: card_id -> { owned, wishlist }
  const [ownedMap, setOwnedMap] = useState({});

  // Full collection for the currently-selected card's set (card_id -> entries[])
  const [setCollection, setSetCollection] = useState({});
  const [selectedCard, setSelectedCard] = useState(null); // { card }
  const [quickAdding, setQuickAdding] = useState(new Set());

  // Load lightweight ownership data once on mount
  useEffect(() => {
    apiFetch('/api/collection?mode=ids')
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const map = {};
        rows.forEach((e) => {
          if (!map[e.card_id]) map[e.card_id] = { owned: false, wishlist: false };
          if (e.wishlist) map[e.card_id].wishlist = true;
          else map[e.card_id].owned = true;
        });
        setOwnedMap(map);
      })
      .catch(() => {});
  }, []);

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch search results when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setSearchError('');
    apiFetch(`/api/cards/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.data ?? []);
        setSearching(false);
        setHasSearched(true);
      })
      .catch((e) => {
        setSearchError(e.message);
        setSearching(false);
        setHasSearched(true);
      });
  }, [debouncedQuery]);

  // Load full collection for a given set (used when opening the modal)
  const loadSetCollection = useCallback((setId) => {
    return apiFetch(`/api/collection?set_id=${setId}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const map = {};
        rows.forEach((e) => {
          if (!map[e.card_id]) map[e.card_id] = [];
          map[e.card_id].push(e);
        });
        setSetCollection(map);

        // Refresh lightweight owned map with latest data from this set
        setOwnedMap((prev) => {
          const next = { ...prev };
          rows.forEach((e) => {
            if (!next[e.card_id]) next[e.card_id] = { owned: false, wishlist: false };
            if (e.wishlist) next[e.card_id].wishlist = true;
            else next[e.card_id].owned = true;
          });
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const openCard = async (card) => {
    await loadSetCollection(card.set.id);
    setSelectedCard({ card });
  };

  const quickAdd = async (e, card, finish) => {
    e.stopPropagation();
    const key = `${card.id}:${finish}`;
    setQuickAdding((s) => new Set(s).add(key));
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: card.id,
        set_id: card.set.id,
        card_name: card.name,
        set_name: card.set.name,
        card_number: card.number,
        card_image: card.images?.small,
        rarity: card.rarity,
        finish,
        quantity: 1,
        condition: 'mint',
        wishlist: false,
      }),
    });
    await loadSetCollection(card.set.id);
    setQuickAdding((s) => { const n = new Set(s); n.delete(key); return n; });
  };

  const handleSave = async (payload) => {
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: 'DELETE' });
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
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
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
  };

  // Group results by set for display
  const grouped = results.reduce((acc, card) => {
    const key = card.set.id;
    if (!acc[key]) acc[key] = { setInfo: card.set, cards: [] };
    acc[key].cards.push(card);
    return acc;
  }, {});
  const groupEntries = Object.values(grouped);

  return (
    <div>
      <h1>Search All Cards</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.95rem' }}>
        Find any card across all sets — search by Pokémon name to see every printing.
      </p>

      <div className="filter-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search by name, e.g. Charizard…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{ flex: '1 1 240px' }}
        />
        {query.length > 0 && (
          <button className="filter-btn" onClick={() => setQuery('')} title="Clear">✕</button>
        )}
        {results.length > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
            {results.length} card{results.length !== 1 ? 's' : ''} in {groupEntries.length} set{groupEntries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {searching && (
        <div className="loading" style={{ marginTop: 32 }}>Searching…</div>
      )}

      {searchError && (
        <div className="loading" style={{ color: '#ef9a9a', marginTop: 16 }}>Error: {searchError}</div>
      )}

      {!searching && hasSearched && results.length === 0 && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <span className="emoji">🔍</span>
          No cards found for "{debouncedQuery}".
        </div>
      )}

      {!searching && !hasSearched && debouncedQuery.length < 2 && query.length > 0 && (
        <div style={{ color: 'var(--text-muted)', marginTop: 24, textAlign: 'center' }}>
          Keep typing…
        </div>
      )}

      {!searching && !hasSearched && query.length === 0 && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          <span className="emoji">🎴</span>
          Type a Pokémon name to search across all sets.
        </div>
      )}

      {groupEntries.map(({ setInfo, cards: setCards }) => (
        <div key={setInfo.id} style={{ marginBottom: 40 }}>
          <div className="search-set-header">
            {setInfo.images?.symbol && (
              <img src={setInfo.images.symbol} alt="" className="search-set-symbol" />
            )}
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{setInfo.name}</h2>
            {setInfo.series && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{setInfo.series}</span>
            )}
            <button
              className="filter-btn"
              style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '2px 10px' }}
              onClick={() => navigate(`/sets/${setInfo.id}`)}
            >
              Browse set →
            </button>
          </div>

          <div className="cards-grid search-results-grid">
            {setCards.map((card) => {
              const entries = setCollection[card.id] ?? [];
              const ownedEntries = entries.filter((e) => !e.wishlist);
              const isWishlist = entries.some((e) => e.wishlist) && ownedEntries.length === 0;
              const isOwned = ownedEntries.length > 0
                || (ownedMap[card.id]?.owned ?? false);
              const showWishlist = isWishlist || (!isOwned && (ownedMap[card.id]?.wishlist ?? false));
              const rarityClass = getRarityColor(card.rarity);

              return (
                <div
                  key={card.id}
                  className={`card-item${isOwned ? ' owned' : ''}${showWishlist ? ' wishlist' : ''}`}
                  onClick={() => openCard(card)}
                >
                  {card.images?.small ? (
                    <img src={card.images.small} alt={card.name} loading="lazy" />
                  ) : (
                    <div className="card-no-image">No image</div>
                  )}

                  {card.rarity && rarityClass && (
                    <span className={`rarity-badge ${rarityClass}`}>{card.rarity}</span>
                  )}

                  {showWishlist && <span className="card-badge wishlist">★</span>}

                  {/* Per-finish badges for owned cards */}
                  {ownedEntries.length > 0 && (
                    <div className="finish-badges">
                      {ownedEntries.map((e) => (
                        <span key={e.finish} className={`finish-qty-pill fqp-${e.finish.replace(' ', '-')}`}>
                          {FINISH_LABELS_SHORT[e.finish] ?? e.finish}×{e.quantity}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Hover panel: adjust owned finishes + quick-add missing */}
                  <div className="finish-hover-panel" onClick={(e) => e.stopPropagation()}>
                    {ownedEntries.map((e) => (
                      <div key={e.finish} className="fhp-row">
                        <span className={`fhp-label fhp-label-${e.finish.replace(' ', '-')}`}>
                          {FINISH_LABELS_SHORT[e.finish] ?? e.finish}
                        </span>
                        <button className="qty-btn" onClick={async (ev) => {
                          ev.stopPropagation();
                          await handleAdjust(e, -1);
                        }}>−</button>
                        <span className="qty-value">×{e.quantity}</span>
                        <button className="qty-btn" onClick={async (ev) => {
                          ev.stopPropagation();
                          await handleAdjust(e, +1);
                        }}>+</button>
                      </div>
                    ))}
                    {getAvailableFinishes(card.variants)
                      .filter((f) => !ownedEntries.some((e) => e.finish === f))
                      .map((f) => {
                        const qaKey = `${card.id}:${f}`;
                        return (
                          <button
                            key={f}
                            className={`fhp-add-btn fhp-add-${f.replace(' ', '-')}`}
                            title={`Quick add ${FINISH_LABELS[f]} (mint)`}
                            onClick={(ev) => quickAdd(ev, card, f)}
                            disabled={quickAdding.has(qaKey)}
                          >
                            {quickAdding.has(qaKey) ? '…' : `+${FINISH_LABELS_SHORT[f] ?? f}`}
                          </button>
                        );
                      })}
                  </div>

                  <div className="card-item-info">
                    <div className="card-item-name">{card.name}</div>
                    <div className="card-item-number">
                      #{card.number}
                      {card.subtypes?.length > 0 && <span className="card-subtype"> · {card.subtypes.join(', ')}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {selectedCard && (
        <CardModal
          card={selectedCard.card}
          collectionEntries={setCollection[selectedCard.card.id] ?? []}
          setName={selectedCard.card.set.name}
          initialFinish={getAvailableFinishes(selectedCard.card.variants)[0]}
          onClose={() => setSelectedCard(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onAdjust={handleAdjust}
        />
      )}
    </div>
  );
}
