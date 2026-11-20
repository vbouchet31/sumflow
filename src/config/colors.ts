/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#26332b',
  gridLine: 'rgba(242, 239, 230, 0.045)',
  deposit: 'rgba(242, 239, 230, 0.05)',
  hub: 'rgba(0, 0, 0, 0.18)',
  text: '#f2efe6',
  depositLocked: '#5f7166',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#3f6f7a',
  adder: '#4f7f4a',
  multiplier: '#b0703a',
  subtractor: '#a84a4a',
  divider: '#6f5a95',
  exponent: '#9a832a',
  storage: '#5f665f',
  bridge: '#4f6f8f',
} as const;

export const HUB_COLORS = {
  fill: 'rgba(0, 0, 0, 0.18)',
  barTrack: '#1f2a24',
  barFill: '#f3e08a',
  textMuted: '#d8dccf',
} as const;

export const FONT_NUM = '"Patrick Hand", cursive';
export const FONT_UI = '"Patrick Hand", "Comic Sans MS", cursive';

export const BELT_COLORS = {
  bridgeBase: '#223029',
  bridgeDeck: '#4a5c50',
  priority: '#9fd39a',
  base: 'rgba(242, 239, 230, 0.05)',
  chevron: 'rgba(242, 239, 230, 0.6)',
  line: 'rgba(242, 239, 230, 0.38)',
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
  pin: '#f29bb8',
  pinEdge: '#1f2a24',
  labelBg: 'rgba(38, 51, 43, 0.9)',
  labelText: '#f29bb8',
} as const;
