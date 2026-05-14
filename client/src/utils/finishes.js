/**
 * Returns which physical finishes are available for a card based on its
 * variants object from the TCGdex API.
 *
 * variants: { normal, reverse, holo, firstEdition, wPromo }
 *
 * Falls back to ['normal'] if no variants data is present.
 */
export function getAvailableFinishes(variants) {
  if (!variants) return ['normal'];

  const finishes = [];
  if (variants.normal) finishes.push('normal');
  if (variants.holo) finishes.push('holo');
  if (variants.reverse) finishes.push('reverse holo');
  if (variants.firstEdition) finishes.push('first edition');

  return finishes.length > 0 ? finishes : ['normal'];
}

export const FINISH_LABELS = {
  normal: 'Normal',
  'reverse holo': 'Rev. Holo',
  holo: 'Holo',
  'first edition': '1st Ed.',
};

export const FINISH_LABELS_SHORT = {
  normal: 'N',
  'reverse holo': 'R',
  holo: 'H',
  'first edition': '1E',
};
