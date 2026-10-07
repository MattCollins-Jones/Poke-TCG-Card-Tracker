import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    apiFetch('/api/sets')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setSetsError(d.error);
        else setSets(d.data ?? []);
        setSetsLoading(false);
      })
      .catch((e) => { setSetsError(e.message); setSetsLoading(false); });
  }, []);

  const digitalSetIds = useMemo(
    () => new Set(sets.filter((s) => isDigitalSeries(s.series)).map((s) => s.id)),
    [sets]
  );

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
