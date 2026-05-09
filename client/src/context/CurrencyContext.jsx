import { createContext, useContext, useEffect, useState } from 'react';

export const CURRENCIES = [
  { code: 'GBP', symbol: '£', label: 'GBP £' },
  { code: 'EUR', symbol: '€', label: 'EUR €' },
  { code: 'USD', symbol: '$', label: 'USD $' },
];

const LS_KEY = 'poketracker_currency';
const DEFAULT = 'GBP';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => localStorage.getItem(LS_KEY) ?? DEFAULT);
  // rates are relative to EUR base (EUR = 1.0)
  const [rates, setRates] = useState({});

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/EUR')
      .then((r) => r.json())
      .then((d) => { if (d?.rates) setRates(d.rates); })
      .catch(() => {});
  }, []);

  const setCurrency = (code) => {
    localStorage.setItem(LS_KEY, code);
    setCurrencyState(code);
  };

  const meta = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];

  /** Convert a EUR amount to the selected currency */
  const convertEur = (eur) => {
    if (currency === 'EUR' || !rates[currency]) return eur;
    return eur * rates[currency];
  };

  /** Convert a USD amount to the selected currency */
  const convertUsd = (usd) => {
    if (!rates.USD) return usd;
    const inEur = usd / rates.USD;
    return convertEur(inEur);
  };

  /** Format a number with the active currency symbol */
  const fmt = (value) => `${meta.symbol}${value.toFixed(2)}`;

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, convertEur, convertUsd, fmt, meta, rates }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
