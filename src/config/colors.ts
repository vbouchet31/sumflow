/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#f3ede1',
  gridLine: '#e6dccb',
  deposit: '#2d3047',
  hub: '#0078bf',
  text: '#ffffff',
  depositLocked: '#b5ab98',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#00838a',
  adder: '#00a95c',
  multiplier: '#ff6c2f',
  subtractor: '#ff48b0',
  divider: '#765ba7',
  exponent: '#e8a400',
  storage: '#88898a',
  bridge: '#3255a4',
} as const;

export const HUB_COLORS = {
  fill: '#0078bf',
  barTrack: '#005a8f',
  barFill: '#ffe800',
  textMuted: '#d4ecfa',
} as const;

export const FONT_NUM = '"Space Mono", ui-monospace, monospace';
export const FONT_UI = '"Space Grotesk", system-ui, sans-serif';

export const BELT_COLORS = {
  bridgeBase: '#d7cdb9',
  bridgeDeck: '#b8ad97',
  priority: '#00a95c',
  base: '#e3d8c4',
  chevron: '#9c917e',
  line: '#cfc4ae',
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
  pin: '#ff48b0',
  pinEdge: '#1e1b18',
  labelBg: 'rgba(255, 251, 242, 0.95)',
  labelText: '#1e1b18',
} as const;
