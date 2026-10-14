import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import SetImage from '../components/SetImage.jsx';
import ShareCardModal, { FinishChip } from '../components/ShareCardModal.jsx';

const FINISH_FILTERS = ['all', 'normal', 'holo', 'reverse holo', 'first edition'];

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);
}

function defaultTitle(data) {
  if (data.type === 'wishlist') return 'Wishlist';
  return `${data.sets[0]?.name ?? 'Set'} — cards still needed`;
}

export default function SharePage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [finishFilter, setFinishFilter] = useState('all');
  const [selected, setSelected] = useState(null); // { card, set }

  useNoIndex();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/collection/share?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? 'This share link is not available');
        return body;
      })
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    const prev = document.title;
    if (data) document.title = `${data.title ?? defaultTitle(data)} · Pokémon Card Tracker`;
    return () => { document.title = prev; };
  }, [data]);

  const availableFinishes = useMemo(() => {
    if (!data) return [];
    const present = new Set();
    data.sets.forEach((s) => s.cards.forEach((c) => c.needed.forEach((f) => present.add(f))));
    return FINISH_FILTERS.filter((f) => f === 'all' || present.has(f));
  }, [data]);

  const visibleSets = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.sets
      .map((s) => ({
        ...s,
        cards: s.cards.filter((c) => {
          if (q && !c.name.toLowerCase().includes(q) && !(c.number ?? '').toLowerCase().includes(q)) return false;
          if (finishFilter !== 'all' && !c.needed.includes(finishFilter)) return false;
          return true;
        }),
      }))
      .filter((s) => s.cards.length > 0);
  }, [data, search, finishFilter]);

  if (loading) return <div className="share-page"><div className="loading">Loading…</div></div>;

  if (error || !data) return (
    <div className="share-page">
      <div className="empty-state">
        <span className="emoji">🔗</span>
        <h2 style={{ marginBottom: 8 }}>Link unavailable</h2>
        <p>{error || 'This share link has been turned off or does not exist.'}</p>
        <Link to="/" className="btn btn-ghost" style={{ marginTop: 20, display: 'inline-block' }}>Go to Pokémon Card Tracker</Link>
      </div>
    </div>
  );

  const title = data.title ?? defaultTitle(data);
  const isSet = data.type === 'set_missing';
  const set0 = data.sets[0];
  const visibleCount = visibleSets.reduce((n, s) => n + s.cards.length, 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="share-page">
      <header className="share-header">
        <div className="share-brand">🎴 Pokémon Card Tracker · <span>shared {isSet ? 'set' : 'wishlist'}</span></div>
        <h1 className="share-title">
          {isSet && set0 && <SetImage set={set0} preferSymbol noDefault style={{ height: 30 }} />}
          {title}
        </h1>
        <p className="share-subtitle">
          {isSet
            ? 'These are the cards and finishes still missing from this set. '
            : 'These are the cards on this collector\'s wishlist. '}
          Tap a card to see a larger image and which versions are needed. This page updates live as the collection changes.
        </p>
      </header>

      <div className="stats-bar">
        <div className="stat-chip">
          <div className="stat-chip-row"><strong>{data.totals.cards}</strong><span>{data.totals.cards === 1 ? 'card' : 'cards'} needed</span></div>
        </div>
        <div className="stat-chip">
          <div className="stat-chip-row"><strong>{data.totals.finishes}</strong><span>{data.totals.finishes === 1 ? 'version' : 'versions'} needed</span></div>
        </div>
        {isSet && (
          <>
            <div className="stat-chip">
              <div className="stat-chip-row">
                <span className="stat-label">Set</span>
                <strong>{data.totals.setOwnedCards}</strong><span> / {data.totals.setCards}</span>
                <span className="stat-pct">{pct(data.totals.setOwnedCards, data.totals.setCards)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct(data.totals.setOwnedCards, data.totals.setCards)}%` }} />
              </div>
            </div>
            <div className="stat-chip">
              <div className="stat-chip-row">
                <span className="stat-label">Master</span>
                <strong>{data.totals.masterOwned}</strong><span> / {data.totals.masterSlots}</span>
                <span className="stat-pct">{pct(data.totals.masterOwned, data.totals.masterSlots)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill progress-fill-master" style={{ width: `${pct(data.totals.masterOwned, data.totals.masterSlots)}%` }} />
              </div>
            </div>
          </>
        )}
        {!isSet && (
          <div className="stat-chip stat-chip-muted">
            <div className="stat-chip-row"><strong>{data.sets.length}</strong><span>{data.sets.length === 1 ? 'set' : 'sets'}</span></div>
          </div>
        )}
      </div>

      <div className="share-legend">
        <span className="share-legend-item">Versions still needed are shown under each card:</span>
        <span className="share-legend-item share-legend-key">N Normal · H Holo · R Reverse Holo · 1E 1st Edition</span>
      </div>

      {data.totals.cards > 0 && (
        <div className="filter-bar">
          <input
            className="search-input"
            type="text"
            placeholder="Search by name or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {availableFinishes.length > 2 && availableFinishes.map((f) => (
            <button
              key={f}
              className={`filter-btn${finishFilter === f ? ' active' : ''}`}
              onClick={() => setFinishFilter(f)}
            >
              {f === 'all' ? 'All versions' : f === 'reverse holo' ? 'Reverse Holo' : f === 'first edition' ? '1st Edition' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {data.totals.cards === 0 ? (
        <div className="empty-state">
          <span className="emoji">🎉</span>
          {isSet ? 'This set is complete — nothing is missing!' : 'This wishlist is empty right now.'}
        </div>
      ) : visibleCount === 0 ? (
        <div className="empty-state"><span className="emoji">🔍</span>No cards match your filters.</div>
      ) : visibleSets.map((set) => (
        <section key={set.id} className="collection-set-group">
          <div className="collection-set-header share-set-header">
            <SetImage set={set} preferSymbol noDefault style={{ height: 22 }} />
            <h2>{set.name}</h2>
            {set.series && <span className="share-series">{set.series}</span>}
            <span className="progress-label">{set.cards.length} {set.cards.length === 1 ? 'card' : 'cards'}</span>
          </div>
          <div className="cards-grid share-grid">
            {set.cards.map((card) => (
              <div key={card.id} className="card-item share-card" onClick={() => setSelected({ card, set })}>
                {card.images?.small ? (
                  <img src={card.images.small} alt={card.name} loading="lazy" />
                ) : (
                  <div className="share-card-noimg">{card.name}</div>
                )}
                <div className="share-card-finishes">
                  {card.needed.map((f) => <FinishChip key={f} finish={f} />)}
                </div>
                <div className="card-item-info">
                  <div className="card-item-name">{card.name}</div>
                  <div className="card-item-number">#{card.number}{card.rarity ? ` · ${card.rarity}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <footer className="share-footer">
        Shared from <Link to="/">Pokémon Card Tracker</Link>
      </footer>

      {selected && (
        <ShareCardModal card={selected.card} set={selected.set} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
