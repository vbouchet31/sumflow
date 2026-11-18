/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#0f1422',
  gridLine: '#1a2236',
  deposit: '#1e2740',
  hub: '#2b6cb0',
  text: '#ffffff',
  depositLocked: '#6b7590',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#3f6e8c',
  adder: '#3f9a5c',
  multiplier: '#d27a32',
  subtractor: '#c84a4a',
  divider: '#8a5cc2',
  exponent: '#c9a72c',
  storage: '#6b7a8f',
  bridge: '#4a6fa5',
} as const;

export const HUB_COLORS = {
  fill: '#2b6cb0',
  barTrack: '#1c4a7d',
  barFill: '#ffffff',
  textMuted: '#c8dcf2',
} as const;

export const FONT_NUM = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_UI = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const BELT_COLORS = {
  bridgeBase: '#1b2232',
  bridgeDeck: '#34405a',
  priority: '#48c774',
  base: '#262f43',
  rail: '#1a2131',
  chevron: '#55627e',
  line: '#3d4860',
} as const;

/**
 * Shape of the belt band, in tiles (one tile = 1).
 * - `band`: half width of the band, rails included; `surface`: half width of its lighter
 *   running surface (the rails are the difference).
 * - `corner`: radius of the outer edge of a quarter turn, from 0 (square corner) to
 *   0.5 + band (a quarter circle centred on the tile corner, inner edge rounded too).
 *   Items and chevrons follow a centre line of radius `corner - band` (0 to 0.5).
 * - `cap`: rounding of a loose end, from 0 (square) to 1 (half disc).
 */
export const BELT_SHAPE = {
  band: 0.38,
  surface: 0.31,
  corner: 0.45,
  cap: 0.6,
} as const;

/** Ghost fills: new, replace, bridge, impossible (PLAN §6.5). */
export const GHOST_COLORS = {
  new: 'rgba(72, 199, 116, 0.45)',
  replace: 'rgba(237, 150, 54, 0.5)',
  bridge: 'rgba(80, 150, 240, 0.5)',
  blocked: 'rgba(230, 70, 70, 0.45)',
  demolish: 'rgba(230, 70, 70, 0.35)',
} as const;

/** Zone selection rectangles (PLAN §8.2). */
export const AREA_COLORS = {
  demolish: { fill: 'rgba(230, 70, 70, 0.18)', stroke: 'rgba(240, 100, 100, 0.9)' },
  clear: { fill: 'rgba(240, 190, 60, 0.15)', stroke: 'rgba(245, 205, 90, 0.9)' },
  copy: { fill: 'rgba(80, 150, 240, 0.15)', stroke: 'rgba(120, 180, 255, 0.9)' },
  cut: { fill: 'rgba(237, 150, 54, 0.18)', stroke: 'rgba(245, 170, 80, 0.9)' },
} as const;

/** Text markers (PLAN §10.2 layer 8). */
export const MARKER_COLORS = {
  pin: '#ffd866',
  pinEdge: '#0a0e1a',
  labelBg: 'rgba(10, 14, 26, 0.85)',
  labelText: '#ffe9a8',
} as const;
