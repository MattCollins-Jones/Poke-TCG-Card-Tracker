import { useEffect, useState } from 'react';

export const DEFAULT_SET_IMAGE = '/set-default.svg';

// Sets with no artwork of their own borrow a same-era logo bundled in /public/logos.
const LOGO_ALIASES = {
  'ex5.5': 'np', exu: 'np',
  'tk-dp-l': 'dpp', 'tk-dp-m': 'dpp',
  'tk-hs-g': 'hgssp', 'tk-hs-r': 'hgssp',
  'tk-bw-e': 'bwp', 'tk-bw-z': 'bwp',
  xya: 'xyp', 'tk-xy-n': 'xyp', 'tk-xy-sy': 'xyp', 'tk-xy-w': 'xyp', 'tk-xy-b': 'xyp',
  'tk-xy-latio': 'xyp', 'tk-xy-latia': 'xyp', 'tk-xy-p': 'xyp', 'tk-xy-su': 'xyp',
  'tk-sm-l': 'smp', 'tk-sm-r': 'smp',
  '2023sv': '2022swsh', '2024sv': '2022swsh',
  mfb: 'svp',
  A3a: 'A3', A3b: 'A3', B1a: 'B1', B2a: 'B2',
  mee: 'me01', mep: 'me01',
};

const local = (dir, id) => [`/${dir}/${id}.webp`, `/${dir}/${id}.png`];

/**
 * Ordered list of candidate URLs for a set's artwork. The DB value (TCGdex or a
 * custom admin upload) always wins; bundled local assets fill the gaps so sets
 * the API has no image for still render something; the generic default is last.
 */
export function setImageCandidates(set, { preferSymbol = false, noDefault = false } = {}) {
  const id = set?.id ?? '';
  const logo = set?.images?.logo || set?.logo_image || null;
  const symbol = set?.images?.symbol || set?.symbol_image || null;
  const alias = LOGO_ALIASES[id];
  const list = preferSymbol
    ? [symbol, ...local('symbols', id), logo, ...local('logos', id)]
    : [logo, symbol, ...local('logos', id), ...local('symbols', id)];
  if (alias) list.push(...local('logos', alias));
  if (!noDefault) list.push(DEFAULT_SET_IMAGE);
  return [...new Set(list.filter(Boolean))];
}

/**
 * <img> that walks the candidate list on load errors, ending at the default image
 * (or rendering nothing when `noDefault` is set — for small inline symbols).
 * Pass `candidates` to override the list (e.g. admin previews of unsaved edits).
 */
export default function SetImage({ set, candidates, preferSymbol, noDefault, alt = '', ...imgProps }) {
  const list = candidates ?? setImageCandidates(set, { preferSymbol, noDefault });
  const key = list.join('|');
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [key]);
  if (idx >= list.length) return null;
  const src = list[idx];
  return (
    <img
      {...imgProps}
      src={src}
      alt={alt}
      data-fallback={src === DEFAULT_SET_IMAGE ? 'default' : undefined}
      onError={() => setIdx(idx + 1)}
    />
  );
}
