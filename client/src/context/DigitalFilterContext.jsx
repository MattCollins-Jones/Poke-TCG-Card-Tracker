import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

export const DIGITAL_SERIES = ['Pokémon TCG Pocket'];

const LS_KEY = 'poketracker_hide_digital';

const DigitalFilterContext = createContext(null);

export function isDigitalSeries(series) {
  return !!series && DIGITAL_SERIES.includes(series);
}

/**
 * Holds the "hide digital-only cards" preference and knows which sets are
 * digital (Pokémon TCG Pocket). Sets are fetched once and shared so pages
 * such as the collection and wishlist can filter rows that only carry set_id.
 */
export function DigitalFilterProvider({ children }) {
  const [hideDigital, setHideDigitalState] = useState(() => localStorage.getItem(LS_KEY) === 'true');
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState('');
  // {id, series} for every set including admin-hidden ones, so saved
  // collection/wishlist entries from hidden Pocket sets are still classified.
  const [seriesById, setSeriesById] = useState({});
  const hasSets = useRef(false);

  /** Re-fetch the catalog (call after sync / admin edits or when returning to Browse Sets). */
  const refreshSets = useCallback(() => {
    setSetsError('');
    if (!hasSets.current) setSetsLoading(true);

    const visible = apiFetch('/api/sets')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setSetsError(d.error); }
        else { setSets(d.data ?? []); hasSets.current = true; }
      })
      .catch((e) => setSetsError(e.message))
      .finally(() => setSetsLoading(false));

    const classification = apiFetch('/api/sets?mode=series')
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.data)) return;
        const map = {};
        d.data.forEach((s) => { map[s.id] = s.series ?? null; });
        setSeriesById(map);
      })
      .catch(() => {});

    return Promise.all([visible, classification]);
  }, []);

  useEffect(() => { refreshSets(); }, [refreshSets]);

  const digitalSetIds = useMemo(() => {
    const ids = new Set();
    Object.entries(seriesById).forEach(([id, series]) => { if (isDigitalSeries(series)) ids.add(id); });
    // Fall back to the visible catalog in case the classification fetch failed
    sets.forEach((s) => { if (isDigitalSeries(s.series)) ids.add(s.id); });
    return ids;
  }, [seriesById, sets]);

  const setHideDigital = (value) => {
    localStorage.setItem(LS_KEY, value ? 'true' : 'false');
    setHideDigitalState(value);
  };

  const isDigitalSet = useCallback((setId) => digitalSetIds.has(setId), [digitalSetIds]);

  /** True when the item should be hidden under the current preference */
  const shouldHideSet = useCallback(
    (setId) => hideDigital && digitalSetIds.has(setId),
    [hideDigital, digitalSetIds]
  );

  const value = {
    hideDigital,
    setHideDigital,
    toggleHideDigital: () => setHideDigital(!hideDigital),
    sets,
    setsLoading,
    setsError,
    refreshSets,
    digitalSetIds,
    isDigitalSet,
    isDigitalSeries,
    shouldHideSet,
  };

  return (
    <DigitalFilterContext.Provider value={value}>
      {children}
    </DigitalFilterContext.Provider>
  );
}

export function useDigitalFilter() {
  return useContext(DigitalFilterContext);
}
