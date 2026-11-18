/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#030a05',
  gridLine: '#0a1f10',
  deposit: '#08240f',
  hub: '#0d4f24',
  text: '#eaffef',
  depositLocked: '#2a5c36',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#1d6b3a',
  adder: '#2f8f4e',
  multiplier: '#b36b00',
  subtractor: '#a33a2a',
  divider: '#2a6f80',
  exponent: '#9a8000',
  storage: '#2b4a35',
  bridge: '#1d5a5a',
} as const;

export const HUB_COLORS = {
  fill: '#0d4f24',
  barTrack: '#06301a',
  barFill: '#5dff7a',
  textMuted: '#a8ffb8',
} as const;

export const FONT_NUM = '"VT323", ui-monospace, monospace';
export const FONT_UI = '"IBM Plex Mono", ui-monospace, monospace';

export const BELT_COLORS = {
  bridgeBase: '#04140a',
  bridgeDeck: '#1a5c2c',
  priority: '#ffb000',
  base: '#061a0d',
  chevron: '#1f7035',
  line: '#134a23',
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
  pin: '#ffb000',
  pinEdge: '#030a05',
  labelBg: 'rgba(3, 14, 7, 0.92)',
  labelText: '#ffb000',
} as const;
