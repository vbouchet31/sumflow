/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#0b0420',
  gridLine: '#24104a',
  deposit: '#1d0b3d',
  hub: '#ff2a6d',
  text: '#ffffff',
  depositLocked: '#56417a',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#0fa3b1',
  adder: '#00b386',
  multiplier: '#ff7a18',
  subtractor: '#ff2a6d',
  divider: '#9d4edd',
  exponent: '#d4ac0d',
  storage: '#5a4a7a',
  bridge: '#3a5fd9',
} as const;

export const HUB_COLORS = {
  fill: '#ff2a6d',
  barTrack: '#8a1040',
  barFill: '#2de2e6',
  textMuted: '#ffd1e1',
} as const;

export const FONT_NUM = '"Share Tech Mono", ui-monospace, monospace';
export const FONT_UI = '"Chakra Petch", system-ui, sans-serif';

export const BELT_COLORS = {
  bridgeBase: '#140830',
  bridgeDeck: '#3a1a6b',
  priority: '#39ff9f',
  base: '#190a3a',
  chevron: '#b04cff',
  line: '#3a1a6b',
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
  pin: '#2de2e6',
  pinEdge: '#0b0420',
  labelBg: 'rgba(20, 8, 46, 0.9)',
  labelText: '#2de2e6',
} as const;
