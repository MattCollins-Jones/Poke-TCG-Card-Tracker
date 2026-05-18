import { useState, useEffect } from 'react';
import { getAvailableFinishes, FINISH_LABELS, FINISH_LABELS_SHORT } from '../utils/finishes.js';
import { useCurrency } from '../context/CurrencyContext.jsx';

const CONDITIONS = ['mint', 'good', 'played', 'poor'];

export default function CardModal({ card, collectionEntries = [], setName, initialFinish, onClose, onSave, onDelete, onAdjust }) {
  const availableFinishes = getAvailableFinishes(card.variants);
  const ownedEntries = collectionEntries.filter((e) => !e.wishlist);

  // Which finish row is expanded for editing vs adding
  const [editingFinish, setEditingFinish] = useState(null);
  const [editCondition, setEditCondition] = useState('mint');
  const [editNotes, setEditNotes] = useState('');

  const [addingFinish, setAddingFinish] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [addCondition, setAddCondition] = useState('mint');
  const [addNotes, setAddNotes] = useState('');
  const [addWishlist, setAddWishlist] = useState(false);

  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(new Set());
  const { convertEur, convertUsd, fmt } = useCurrency();
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleAdjust = async (entry, delta) => {
    setAdjusting((s) => new Set(s).add(entry.id));
    try {
      await onAdjust(entry, delta);
    } finally {
      setAdjusting((s) => { const n = new Set(s); n.delete(entry.id); return n; });
    }
  };

  const startEditing = (entry) => {
    if (editingFinish === entry.finish) { setEditingFinish(null); return; }
    setAddingFinish(null);
    setEditingFinish(entry.finish);
    setEditCondition(entry.condition ?? 'mint');
    setEditNotes(entry.notes ?? '');
  };

  const handleSaveEdit = async (entry) => {
    setSaving(true);
    await onSave({
      card_id: card.id, set_id: card.set.id, card_name: card.name,
      set_name: setName ?? card.set?.name ?? card.set?.id ?? '',
      card_number: card.number, card_image: card.images?.small, rarity: card.rarity,
      finish: entry.finish, quantity: entry.quantity,
      condition: editCondition, wishlist: false, notes: editNotes,
    });
    setSaving(false);
    setEditingFinish(null);
  };

  const handleRemove = async (entry) => {
    setSaving(true);
    await onDelete(entry.id);
    setSaving(false);
    setEditingFinish(null);
  };

  const startAdding = (f) => {
    if (addingFinish === f) { setAddingFinish(null); return; }
    setEditingFinish(null);
    setAddingFinish(f);
    setAddQty(1);
    setAddCondition('mint');
    setAddNotes('');
    setAddWishlist(false);
  };

  const handleAddFinish = async () => {
    const qty = Math.max(1, parseInt(addQty, 10) || 1);
    setSaving(true);
    await onSave({
      card_id: card.id, set_id: card.set.id, card_name: card.name,
      set_name: setName ?? card.set?.name ?? card.set?.id ?? '',
      card_number: card.number, card_image: card.images?.small, rarity: card.rarity,
      finish: addingFinish, quantity: qty,
      condition: addCondition, wishlist: addWishlist, notes: addNotes,
    });
    setSaving(false);
    setAddingFinish(null);
  };

  return (
    <>
    {lightbox && (
      <div className="lightbox-overlay" onClick={() => setLightbox(false)}>
        <img
          src={card.images?.large ?? card.images?.small}
          alt={card.name}
          className="lightbox-img"
          onClick={(e) => e.stopPropagation()}
        />
        <button className="lightbox-close" onClick={() => setLightbox(false)}>✕</button>
      </div>
    )}
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
        <div className="modal-header">
          {card.images?.small && (
            <img
              src={card.images.small}
              alt={card.name}
              className="modal-card-thumb"
              title="Click to enlarge"
              onClick={() => setLightbox(true)}
            />
          )}
          <div className="modal-header-info">
            <h2>{card.name}</h2>
            <div className="meta">#{card.number} · {setName ?? card.set?.name}</div>
            {card.rarity && <div className="meta rarity-text">{card.rarity}</div>}
            {card.subtypes?.length > 0 && <div className="meta">{card.subtypes.join(', ')}</div>}
          </div>
        </div>

        {card.pricing && (
          <div className="pricing-section">
            <div className="pricing-title">Market Prices</div>
            <div className="pricing-grid">
              {card.pricing.cardmarket && (
                <div className="pricing-source">
                  <span className="pricing-source-label">🏩 Cardmarket</span>
                  <div className="pricing-rows">
                    {card.pricing.cardmarket.trend != null && (
                      <span>Trend <strong>{fmt(convertEur(card.pricing.cardmarket.trend))}</strong></span>
                    )}
                    {card.pricing.cardmarket.avg30 != null && (
                      <span>30-day avg <strong>{fmt(convertEur(card.pricing.cardmarket.avg30))}</strong></span>
                    )}
                    {card.pricing.cardmarket.low != null && (
                      <span>Low <strong>{fmt(convertEur(card.pricing.cardmarket.low))}</strong></span>
                    )}
                    {card.pricing.cardmarket.trendHolo != null && (
                      <span>Holo trend <strong>{fmt(convertEur(card.pricing.cardmarket.trendHolo))}</strong></span>
                    )}
                  </div>
                </div>
              )}
              {card.pricing.tcgplayer && (
                <div className="pricing-source">
                  <span className="pricing-source-label">🏦 TCGPlayer</span>
                  <div className="pricing-rows">
                    {card.pricing.tcgplayer.normalMarket != null && <span>Market <strong>{fmt(convertUsd(card.pricing.tcgplayer.normalMarket))}</strong></span>}
                    {card.pricing.tcgplayer.normalLow != null && <span>Low <strong>{fmt(convertUsd(card.pricing.tcgplayer.normalLow))}</strong></span>}
                    {card.pricing.tcgplayer.reverseMarket != null && <span>Reverse market <strong>{fmt(convertUsd(card.pricing.tcgplayer.reverseMarket))}</strong></span>}
                  </div>
                </div>
              )}
            </div>
            {card.pricing.updatedAt && (
              <div className="pricing-updated">Updated {new Date(card.pricing.updatedAt).toLocaleDateString()}</div>
            )}
          </div>
        )}

        {/* Per-finish collection management */}
        <div className="finish-list">
          <div className="finish-list-title">Collection</div>
          {availableFinishes.map((f) => {
            const entry = ownedEntries.find((e) => e.finish === f) ?? null;
            const wishlistEntry = collectionEntries.find((e) => e.finish === f && e.wishlist) ?? null;
            const isEditing = editingFinish === f;
            const isAdding = addingFinish === f;
            const isAdjusting = entry && adjusting.has(entry.id);

            return (
              <div key={f} className={`finish-row${entry ? ' finish-row-owned' : ''}${(isEditing || isAdding) ? ' finish-row-expanded' : ''}`}>
                <div className="finish-row-main">
                  <span className={`fhp-label fhp-label-${f.replace(' ', '-')}`}>
                    {FINISH_LABELS_SHORT[f] ?? f}
                  </span>
                  <span className="finish-row-name">{FINISH_LABELS[f]}</span>

                  {entry ? (
                    <>
                      <div className="finish-row-qty">
                        <button className="qty-btn" onClick={() => handleAdjust(entry, -1)} disabled={isAdjusting}>−</button>
                        <span className="qty-value">×{entry.quantity}</span>
                        <button className="qty-btn" onClick={() => handleAdjust(entry, +1)} disabled={isAdjusting}>+</button>
                      </div>
                      <span className="finish-row-condition">{entry.condition}</span>
                      <button
                        className={`finish-row-edit-btn${isEditing ? ' active' : ''}`}
                        onClick={() => startEditing(entry)}
                        title="Edit condition & notes"
                      >⋯</button>
                    </>
                  ) : (
                    <button
                      className={`finish-row-add-btn${isAdding ? ' active' : ''}`}
                      onClick={() => startAdding(f)}
                    >
                      {isAdding ? '✕ Cancel' : '+ Add'}
                    </button>
                  )}
                  {wishlistEntry && !entry && (
                    <>
                      <span className="finish-row-wishlist" title="On wishlist">★ Wishlist</span>
                      <button
                        className="fhp-remove-btn finish-row-remove-wish-btn"
                        title="Remove from wishlist"
                        onClick={() => handleRemove(wishlistEntry)}
                        disabled={saving}
                      >✕ Remove</button>
                    </>
                  )}
                </div>

                {/* Inline edit form (condition/notes) */}
                {isEditing && entry && (
                  <div className="finish-inline-form">
                    <div className="finish-inline-row">
                      <label>Condition</label>
                      <select className="form-control form-control-sm" value={editCondition} onChange={(e) => setEditCondition(e.target.value)}>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="finish-inline-row">
                      <label>Notes</label>
                      <input type="text" className="form-control form-control-sm" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes…" />
                    </div>
                    <div className="finish-inline-actions">
                      <button className="btn btn-danger btn-sm" onClick={() => handleRemove(entry)} disabled={saving}>Remove</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingFinish(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(entry)} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline add form for a new finish */}
                {isAdding && (
                  <div className="finish-inline-form">
                    <div className="finish-inline-row">
                      <label>Quantity</label>
                      <input type="number" className="form-control form-control-sm" min="1" max="99" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
                    </div>
                    <div className="finish-inline-row">
                      <label>Condition</label>
                      <select className="form-control form-control-sm" value={addCondition} onChange={(e) => setAddCondition(e.target.value)}>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="finish-inline-row">
                      <label className="checkbox-row">
                        <input type="checkbox" checked={addWishlist} onChange={(e) => setAddWishlist(e.target.checked)} />
                        Add to Wishlist instead
                      </label>
                    </div>
                    <div className="finish-inline-row">
                      <label>Notes</label>
                      <input type="text" className="form-control form-control-sm" value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Optional notes…" />
                    </div>
                    <div className="finish-inline-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setAddingFinish(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={handleAddFinish} disabled={saving || !(parseInt(addQty, 10) >= 1)}>
                        {saving ? 'Saving…' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    </>
  );
}
