// Server-side mirror of client/src/utils/finishes.js — keep the two in sync.
export function getAvailableFinishes(variants) {
  if (!variants) return ['normal'];
  const finishes = [];
  if (variants.normal) finishes.push('normal');
  if (variants.holo) finishes.push('holo');
  if (variants.reverse) finishes.push('reverse holo');
  if (variants.firstEdition) finishes.push('first edition');
  return finishes.length > 0 ? finishes : ['normal'];
}

export function sortByNumber(a, b) {
  const an = a.number ?? '', bn = b.number ?? '';
  const ai = parseInt(an, 10), bi = parseInt(bn, 10);
  if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
  return an.localeCompare(bn);
}
