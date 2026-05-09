import { useState, useEffect } from 'react';
import { getAvailableFinishes, FINISH_LABELS } from '../utils/finishes.js';

const CONDITIONS = ['mint', 'good', 'played', 'poor'];

export default function CardModal({ card, collectionEntries = [], setName, initialFinish, onClose, onSave, onDelete }) {
  const availableFinishes = getAvailableFinishes(card.variants);
  const ownedEntries = collectionEntries.filter((e) => !e.wishlist);
  const firstOwned = ownedEntries[0] ?? null;

  const defaultFinish = initialFinish ?? firstOwned?.finish ?? availableFinishes[0];
  const [finish, setFinish] = useState(availableFinishes.includes(defaultFinish) ? defaultFinish : availableFinishes[0]);
  const [quantity, setQuantity] = useState(firstOwned?.finish === finish ? (firstOwned?.quantity ?? 1) : 1);
  const [condition, setCondition] = useState(firstOwned?.finish === finish ? (firstOwned?.condition ?? 'mint') : 'mint');
  const [wishlist, setWishlist] = useState(!firstOwned && collectionEntries.some((e) => e.wishlist));
  const [notes, setNotes] = useState(firstOwned?.finish === finish ? (firstOwned?.notes ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [gbpRate, setGbpRate] = useState(null);
  const [lightbox, setLightbox] = useState(false);

  // Fetch EUR→GBP rate once when pricing data is present
  useEffect(() => {
    if (!card.pricing?.cardmarket) return;
    fetch('https://open.er-api.com/v6/latest/EUR')
      .then((r) => r.json())
      .then((d) => { if (d?.rates?.GBP) setGbpRate(d.rates.GBP); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When finish changes, load the matching entry's data
  useEffect(() => {
    const match = ownedEntries.find((e) => e.finish === finish) ?? null;
    if (match) {
      setQuantity(match.quantity);
      setCondition(match.condition);
      setNotes(match.notes ?? '');
      setWishlist(false);
    } else {
      setQuantity(1);
      setCondition('mint');
      setNotes('');
    }
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchingEntry = collectionEntries.find((e) => e.finish === finish && !e.wishlist);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      card_id: card.id,
      set_id: card.set.id,
      card_name: card.name,
      set_name: setName ?? card.set?.name ?? card.set?.id ?? '',
      card_number: card.number,
      card_image: card.images?.small,
      rarity: card.rarity,
      finish,
      quantity: parseInt(quantity, 10),
      condition,
      wishlist,
      notes,
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!matchingEntry) return;
    setSaving(true);
    await onDelete(matchingEntry.id);
    setSaving(false);
    onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const finishSummary = ownedEntries.map((e) => `${e.finish} ×${e.quantity}`).join(', ');

  const toGbp = (eur) => gbpRate != null ? `£${(eur * gbpRate).toFixed(2)}` : null;

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
            {finishSummary && <div className="meta owned-summary">Owned: {finishSummary}</div>}
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
                      <span>Trend <strong>€{card.pricing.cardmarket.trend.toFixed(2)}{toGbp(card.pricing.cardmarket.trend) && <> · {toGbp(card.pricing.cardmarket.trend)}</>}</strong></span>
                    )}
                    {card.pricing.cardmarket.avg30 != null && (
                      <span>30-day avg <strong>€{card.pricing.cardmarket.avg30.toFixed(2)}{toGbp(card.pricing.cardmarket.avg30) && <> · {toGbp(card.pricing.cardmarket.avg30)}</>}</strong></span>
                    )}
                    {card.pricing.cardmarket.low != null && (
                      <span>Low <strong>€{card.pricing.cardmarket.low.toFixed(2)}{toGbp(card.pricing.cardmarket.low) && <> · {toGbp(card.pricing.cardmarket.low)}</>}</strong></span>
                    )}
                    {card.pricing.cardmarket.trendHolo != null && (
                      <span>Holo trend <strong>€{card.pricing.cardmarket.trendHolo.toFixed(2)}{toGbp(card.pricing.cardmarket.trendHolo) && <> · {toGbp(card.pricing.cardmarket.trendHolo)}</>}</strong></span>
                    )}
                  </div>
                </div>
              )}
              {card.pricing.tcgplayer && (
                <div className="pricing-source">
                  <span className="pricing-source-label">🏦 TCGPlayer (USD)</span>
                  <div className="pricing-rows">
                    {card.pricing.tcgplayer.normalMarket != null && <span>Market <strong>${card.pricing.tcgplayer.normalMarket.toFixed(2)}</strong></span>}
                    {card.pricing.tcgplayer.normalLow != null && <span>Low <strong>${card.pricing.tcgplayer.normalLow.toFixed(2)}</strong></span>}
                    {card.pricing.tcgplayer.reverseMarket != null && <span>Reverse market <strong>${card.pricing.tcgplayer.reverseMarket.toFixed(2)}</strong></span>}
                  </div>
                </div>
              )}
            </div>
            {card.pricing.updatedAt && (
              <div className="pricing-updated">Updated {new Date(card.pricing.updatedAt).toLocaleDateString()}</div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Finish</label>
          {availableFinishes.length === 1 ? (
            <div className="single-finish">{FINISH_LABELS[availableFinishes[0]]}</div>
          ) : (
            <div className="finish-selector">
              {availableFinishes.map((f) => (
                <button
                  key={f}
                  className={`finish-btn${finish === f ? ' active' : ''}${ownedEntries.some((e) => e.finish === f) ? ' has-entry' : ''}`}
                  onClick={() => setFinish(f)}
                >
                  {FINISH_LABELS[f]}
                  {ownedEntries.some((e) => e.finish === f) && <span className="finish-dot">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Quantity</label>
          <input type="number" className="form-control" min="0" max="99" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Condition</label>
          <select className="form-control" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="checkbox-row">
            <input type="checkbox" checked={wishlist} onChange={(e) => setWishlist(e.target.checked)} />
            Add to Wishlist
          </label>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <input type="text" className="form-control" placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          {matchingEntry && (
            <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>Remove {finish}</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
