import { useEffect, useState } from 'react';
import { FINISH_LABELS, FINISH_LABELS_SHORT } from '../utils/finishes.js';

/** Finish chip used on both the share grid and the read-only modal */
export function FinishChip({ finish }) {
  const cls = `share-finish fhp-label fhp-label-${finish.replace(' ', '-')}`;
  return <span className={cls} title={`Needs ${FINISH_LABELS[finish] ?? finish}`}>{FINISH_LABELS_SHORT[finish] ?? finish}</span>;
}

/**
 * Read-only card detail for public share pages: large image + which finishes
 * the owner still needs. No pricing, no editing.
 */
export default function ShareCardModal({ card, set, onClose }) {
  const [lightbox, setLightbox] = useState(false);
  const large = card.images?.large ?? card.images?.small;

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(false); else onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, lightbox]);

  return (
    <>
      {lightbox && large && (
        <div className="lightbox-overlay" onClick={() => setLightbox(false)}>
          <img src={large} alt={card.name} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(false)}>✕</button>
        </div>
      )}
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal share-modal">
          <button className="modal-close-btn" onClick={onClose} title="Close">✕</button>
          <div className="share-modal-body">
            {large ? (
              <img
                src={large}
                alt={card.name}
                className="share-modal-img"
                title="Click to enlarge"
                onClick={() => setLightbox(true)}
              />
            ) : (
              <div className="share-modal-img share-modal-noimg">{card.name}</div>
            )}
            <div className="share-modal-info">
              <h2>{card.name}</h2>
              <div className="meta">#{card.number} · {set?.name ?? set?.id}</div>
              {card.rarity && <div className="meta rarity-text">{card.rarity}</div>}

              <div className="share-modal-section">
                <div className="finish-list-title">Still needed</div>
                <ul className="share-finish-list">
                  {card.needed.map((f) => (
                    <li key={f}>
                      <FinishChip finish={f} />
                      <span>{FINISH_LABELS[f] ?? f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {large && (
                <button className="btn btn-ghost btn-sm" onClick={() => setLightbox(true)}>🔍 View full size</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
