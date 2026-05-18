import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CardModal from "../components/CardModal.jsx";
import { getAvailableFinishes, FINISH_LABELS, FINISH_LABELS_SHORT } from "../utils/finishes.js";
import { apiFetch } from "../lib/apiFetch.js";
import { useCurrency } from "../context/CurrencyContext.jsx";

function getRarityColor(rarity) {
  if (!rarity) return null;
  const r = rarity.toLowerCase();
  if (r.includes("special illustration")) return "rarity-sir";
  if (r.includes("hyper") || r.includes("rainbow")) return "rarity-hyper";
  if (r.includes("illustration rare")) return "rarity-ir";
  if (r.includes("ultra") || r.includes("secret") || r.includes("ace spec")) return "rarity-ultra";
  if (r.includes("double rare") || r.includes("rare holo")) return "rarity-holo";
  if (r.includes("rare")) return "rarity-rare";
  return null;
}

export default function SetsPage() {
  const navigate = useNavigate();
  const { fmt, convertEur, convertUsd } = useCurrency();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [sets, setSets] = useState([]);
  const [collectionSummary, setCollectionSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cardResults, setCardResults] = useState([]);
  const [cardSearching, setCardSearching] = useState(false);
  const [cardSearchError, setCardSearchError] = useState("");
  const [hasCardSearched, setHasCardSearched] = useState(false);
  const [ownedMap, setOwnedMap] = useState({});
  const [setCollection, setSetCollection] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [quickAdding, setQuickAdding] = useState(new Set());
  const [ownedMapLoaded, setOwnedMapLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/sets")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else { setSets(d.data ?? []); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });

    apiFetch("/api/collection?mode=summary")
      .then((r) => r.json())
      .then((summary) => {
        if (!Array.isArray(summary)) return;
        const map = {};
        summary.forEach((s) => { map[s.set_id] = s.owned_cards; });
        setCollectionSummary(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setCardResults([]);
      setHasCardSearched(false);
      return;
    }
    if (!ownedMapLoaded) {
      apiFetch("/api/collection?mode=ids")
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
          setOwnedMapLoaded(true);
        })
        .catch(() => {});
    }
    setCardSearching(true);
    setCardSearchError("");
    apiFetch(`/api/cards/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((data) => { setCardResults(data.data ?? []); setCardSearching(false); setHasCardSearched(true); })
      .catch((e) => { setCardSearchError(e.message); setCardSearching(false); setHasCardSearched(true); });
  }, [debouncedSearch]);

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

  const openCard = async (card) => { await loadSetCollection(card.set.id); setSelectedCard({ card }); };

  const quickAdd = async (e, card, finish) => {
    e.stopPropagation();
    const key = `${card.id}:${finish}`;
    setQuickAdding((s) => new Set(s).add(key));
    await apiFetch("/api/collection", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: card.id, set_id: card.set.id, card_name: card.name, set_name: card.set.name, card_number: card.number, card_image: card.images?.small, rarity: card.rarity, finish, quantity: 1, condition: "mint", wishlist: false }),
    });
    await loadSetCollection(card.set.id);
    setQuickAdding((s) => { const n = new Set(s); n.delete(key); return n; });
  };

  const quickAddWishlist = async (e, card, finish) => {
    e.stopPropagation();
    const key = `${card.id}:${finish}:wish`;
    setQuickAdding((s) => new Set(s).add(key));
    await apiFetch("/api/collection", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: card.id, set_id: card.set.id, card_name: card.name, set_name: card.set.name, card_number: card.number, card_image: card.images?.small, rarity: card.rarity, finish, quantity: 1, condition: "mint", wishlist: true }),
    });
    await loadSetCollection(card.set.id);
    setOwnedMap((prev) => { const next = { ...prev }; if (!next[card.id]) next[card.id] = { owned: false, wishlist: false }; next[card.id].wishlist = true; return next; });
    setQuickAdding((s) => { const n = new Set(s); n.delete(key); return n; });
  };

  const handleSave = async (payload) => {
    await apiFetch("/api/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: "DELETE" });
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
  };

  const handleAdjust = async (entry, delta) => {
    const newQty = entry.quantity + delta;
    if (newQty <= 0) {
      await apiFetch(`/api/collection/${entry.id}`, { method: "DELETE" });
    } else {
      await apiFetch(`/api/collection/${entry.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: newQty, condition: entry.condition, wishlist: entry.wishlist, notes: entry.notes }) });
    }
    if (selectedCard) await loadSetCollection(selectedCard.card.set.id);
  };

  const getCardPrice = (card) => {
    if (!card.pricing) return null;
    if (card.pricing.tcgplayer?.normalMarket != null) return fmt(convertUsd(card.pricing.tcgplayer.normalMarket));
    if (card.pricing.cardmarket?.trend != null) return fmt(convertEur(card.pricing.cardmarket.trend));
    return null;
  };

  const filtered = sets.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.series?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = filtered.reduce((acc, set) => {
    const key = set.series || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(set);
    return acc;
  }, {});

  const cardGrouped = cardResults.reduce((acc, card) => {
    const key = card.set.id;
    if (!acc[key]) acc[key] = { setInfo: card.set, cards: [] };
    acc[key].cards.push(card);
    return acc;
  }, {});
  const cardGroupEntries = Object.values(cardGrouped);

  const isSearching = search.length > 0;

  if (loading) return <div className="loading">Loading sets...</div>;
  if (error) return <div className="loading" style={{ color: "#ef9a9a" }}>Error: {error}</div>;

  return (
    <div>
      <h1>Browse Sets</h1>

      <div className="filter-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search sets, series or card names..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 240px" }}
        />
        {search.length > 0 && (
          <button className="filter-btn" onClick={() => setSearch("")} title="Clear">x</button>
        )}
        {!isSearching && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{filtered.length} sets</span>
        )}
        {isSearching && !cardSearching && (filtered.length > 0 || cardResults.length > 0) && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", whiteSpace: "nowrap" }}>
            {filtered.length > 0 && `${filtered.length} set${filtered.length !== 1 ? "s" : ""}`}
            {filtered.length > 0 && cardResults.length > 0 && " \u00B7 "}
            {cardResults.length > 0 && `${cardResults.length} card${cardResults.length !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {!isSearching && (
        <>
          {Object.entries(grouped).map(([series, seriesSets]) => (
            <div key={series} style={{ marginBottom: 32 }}>
              <h2>{series}</h2>
              <div className="sets-grid">
                {seriesSets.map((set) => (
                  <div key={set.id} className="set-card" onClick={() => navigate(`/sets/${set.id}`)}>
                    {set.images?.logo ? (
                      <img src={set.images.logo} alt={set.name} />
                    ) : set.images?.symbol ? (
                      <div className="set-symbol-fallback">
                        <img src={set.images.symbol} alt={set.name} className="set-symbol-img" />
                      </div>
                    ) : (
                      <div className="set-logo-placeholder"><span>{set.name}</span></div>
                    )}
                    <div className="set-name">{set.name}</div>
                    <div className="set-meta">
                      {collectionSummary[set.id]
                        ? <span className="set-owned">{collectionSummary[set.id]}/{set.total}</span>
                        : <span>{set.total} cards</span>
                      } · {set.releaseDate?.slice(0, 4)}
                    </div>
                    {collectionSummary[set.id] > 0 && (
                      <div className="progress-bar set-progress">
                        <div className="progress-fill" style={{ width: `${Math.round((collectionSummary[set.id] / set.total) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state"><span className="emoji">&#128269;</span>No sets match your search.</div>
          )}
        </>
      )}

      {isSearching && (
        <>
          {filtered.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: "1rem", color: "var(--text-muted)", marginBottom: 12 }}>
                Sets ({filtered.length})
              </h2>
              <div className="sets-grid sets-grid-compact">
                {filtered.map((set) => (
                  <div key={set.id} className="set-card" onClick={() => navigate(`/sets/${set.id}`)}>
                    {set.images?.logo ? (
                      <img src={set.images.logo} alt={set.name} />
                    ) : set.images?.symbol ? (
                      <div className="set-symbol-fallback">
                        <img src={set.images.symbol} alt={set.name} className="set-symbol-img" />
                      </div>
                    ) : (
                      <div className="set-logo-placeholder"><span>{set.name}</span></div>
                    )}
                    <div className="set-name">{set.name}</div>
                    <div className="set-meta">
                      {collectionSummary[set.id]
                        ? <span className="set-owned">{collectionSummary[set.id]}/{set.total}</span>
                        : <span>{set.total} cards</span>
                      } · {set.releaseDate?.slice(0, 4)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {debouncedSearch.length >= 2 && (
            <>
              {cardResults.length > 0 && (
                <h2 style={{ fontSize: "1rem", color: "var(--text-muted)", marginBottom: 12 }}>
                  Cards ({cardResults.length} across {cardGroupEntries.length} set{cardGroupEntries.length !== 1 ? "s" : ""})
                </h2>
              )}
              {cardSearching && <div className="loading" style={{ marginTop: 16 }}>Searching cards...</div>}
              {cardSearchError && <div className="loading" style={{ color: "#ef9a9a" }}>Error: {cardSearchError}</div>}
              {!cardSearching && hasCardSearched && cardResults.length === 0 && (
                <div className="empty-state" style={{ marginTop: 16 }}>
                  <span className="emoji">&#128269;</span>No cards found for "{debouncedSearch}".
                </div>
              )}

              {cardGroupEntries.map(({ setInfo, cards: setCards }) => (
                <div key={setInfo.id} style={{ marginBottom: 40 }}>
                  <div className="search-set-header">
                    {setInfo.images?.symbol && <img src={setInfo.images.symbol} alt="" className="search-set-symbol" />}
                    <h2 style={{ fontSize: "1.1rem", margin: 0 }}>{setInfo.name}</h2>
                    {setInfo.series && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{setInfo.series}</span>}
                    <button className="filter-btn" style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "2px 10px" }} onClick={() => navigate(`/sets/${setInfo.id}`)}>
                      Browse set
                    </button>
                  </div>

                  <div className="cards-grid search-results-grid">
                    {setCards.map((card) => {
                      const entries = setCollection[card.id] ?? [];
                      const ownedEntries = entries.filter((e) => !e.wishlist);
                      const isOwned = ownedEntries.length > 0 || (ownedMap[card.id]?.owned ?? false);
                      const showWishlist = (entries.some((e) => e.wishlist) && ownedEntries.length === 0) || (!isOwned && (ownedMap[card.id]?.wishlist ?? false));
                      const rarityClass = getRarityColor(card.rarity);
                      const price = getCardPrice(card);

                      return (
                        <div
                          key={card.id}
                          className={`card-item${isOwned ? " owned" : ""}${showWishlist ? " wishlist" : ""}`}
                          onClick={() => openCard(card)}
                        >
                          {card.images?.small
                            ? <img src={card.images.small} alt={card.name} loading="lazy" />
                            : <div className="card-no-image">No image</div>}
                          {card.rarity && rarityClass && <span className={`rarity-badge ${rarityClass}`}>{card.rarity}</span>}
                          {showWishlist && <span className="card-badge wishlist">&#9733;</span>}
                          {ownedEntries.length > 0 && (
                            <div className="finish-badges">
                              {ownedEntries.map((e) => (
                                <span key={e.finish} className={`finish-qty-pill fqp-${e.finish.replace(" ", "-")}`}>
                                  {FINISH_LABELS_SHORT[e.finish] ?? e.finish}x{e.quantity}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="finish-hover-panel" onClick={(e) => e.stopPropagation()}>
                            {ownedEntries.map((e) => (
                              <div key={e.finish} className="fhp-row">
                                <span className={`fhp-label fhp-label-${e.finish.replace(" ", "-")}`}>{FINISH_LABELS_SHORT[e.finish] ?? e.finish}</span>
                                <button className="qty-btn" onClick={async (ev) => { ev.stopPropagation(); await handleAdjust(e, -1); }}>-</button>
                                <span className="qty-value">x{e.quantity}</span>
                                <button className="qty-btn" onClick={async (ev) => { ev.stopPropagation(); await handleAdjust(e, +1); }}>+</button>
                              </div>
                            ))}
                            {getAvailableFinishes(card.variants)
                              .filter((f) => !ownedEntries.some((e) => e.finish === f))
                              .map((f) => {
                                const qaKey = `${card.id}:${f}`;
                                const wKey = `${card.id}:${f}:wish`;
                                const wishlistEntry = entries.find((we) => we.finish === f && we.wishlist);
                                if (wishlistEntry) {
                                  return (
                                    <div key={f} className="fhp-wish-row">
                                      <span className="fhp-wish-badge" title={`${FINISH_LABELS[f] ?? f} on wishlist`}>★{FINISH_LABELS_SHORT[f]}</span>
                                      <button className={`fhp-add-btn fhp-add-${f.replace(" ", "-")}`} title={`Add ${FINISH_LABELS[f]} to collection`} onClick={(ev) => quickAdd(ev, card, f)} disabled={quickAdding.has(qaKey)}>
                                        {quickAdding.has(qaKey) ? "..." : "+"}
                                      </button>
                                      <button className="qty-btn" title="Remove from wishlist" onClick={async (ev) => { ev.stopPropagation(); await handleDelete(wishlistEntry.id); }}>✕</button>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={f} className="fhp-unowned-row">
                                    <button className={`fhp-add-btn fhp-add-${f.replace(" ", "-")}`} title={`Quick add ${FINISH_LABELS[f]} (mint)`} onClick={(ev) => quickAdd(ev, card, f)} disabled={quickAdding.has(qaKey)}>
                                      {quickAdding.has(qaKey) ? "..." : `+${FINISH_LABELS_SHORT[f] ?? f}`}
                                    </button>
                                    <button className="fhp-wish-btn" title={`Add ${FINISH_LABELS[f]} to wishlist`} onClick={(ev) => quickAddWishlist(ev, card, f)} disabled={quickAdding.has(wKey)}>
                                      {quickAdding.has(wKey) ? "..." : "★"}
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="card-item-info">
                            <div className="card-item-name">{card.name}</div>
                            <div className="card-item-number">
                              #{card.number}
                              {card.subtypes?.length > 0 && <span className="card-subtype"> · {card.subtypes.join(", ")}</span>}
                            </div>
                            {price && <div className="card-item-price">{price}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

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