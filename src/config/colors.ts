/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#1c1714',
  gridLine: '#241e1a',
  deposit: '#2f2721',
  hub: '#c8643b',
  text: '#fff8ef',
  depositLocked: '#6b5a4a',
} as const;

/** Building colours (PLAN §6.3). Operators are also told apart by symbol and shape (§9.5). */
export const BUILDING_COLORS = {
  extractor: '#5f7f8c',
  adder: '#7d9a5a',
  multiplier: '#d98a3d',
  subtractor: '#c4553f',
  divider: '#8e6aa8',
  exponent: '#c99a2e',
  storage: '#7a6a5c',
  bridge: '#5f7f8c',
} as const;

export const HUB_COLORS = {
  fill: '#c8643b',
  barTrack: '#8a3f22',
  barFill: '#fff3e3',
  textMuted: '#ffe0cc',
} as const;

export const FONT_NUM = '"Fredoka", ui-rounded, system-ui, sans-serif';
export const FONT_UI = '"Nunito", ui-rounded, system-ui, sans-serif';

export const BELT_COLORS = {
  bridgeBase: '#241d18',
  bridgeDeck: '#4a3d33',
  priority: '#9cc874',
  base: '#2c241f',
  chevron: '#6b5a4a',
  line: '#3f342c',
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
  pin: '#f2c46d',
  pinEdge: '#1c1714',
  labelBg: 'rgba(42, 34, 29, 0.92)',
  labelText: '#f2c46d',
} as const;
