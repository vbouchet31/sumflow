/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#f7f5f0',
  gridLine: '#ebe7de',
  deposit: '#2b2b2b',
  hub: '#111111',
  text: '#ffffff',
  depositLocked: '#c9c4b8',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#6b6b6b',
  adder: '#1f4fbf',
  multiplier: '#f5a300',
  subtractor: '#e63022',
  divider: '#2a9d8f',
  exponent: '#8e44ad',
  storage: '#9a958a',
  bridge: '#1f4fbf',
} as const;

export const HUB_COLORS = {
  fill: '#111111',
  barTrack: '#3a3a3a',
  barFill: '#f5c400',
  textMuted: '#d6d6d6',
} as const;

export const FONT_NUM = '"Jost", "Futura", system-ui, sans-serif';
export const FONT_UI = '"Jost", "Futura", system-ui, sans-serif';

export const BELT_COLORS = {
  bridgeBase: '#dcd7cc',
  bridgeDeck: '#b9b3a6',
  priority: '#e63022',
  base: '#e6e1d6',
  chevron: '#a39d90',
  line: '#d0ccc2',
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
  pin: '#e63022',
  pinEdge: '#111111',
  labelBg: 'rgba(255, 255, 255, 0.95)',
  labelText: '#111111',
} as const;
