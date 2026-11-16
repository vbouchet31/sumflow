/** Visual palette (PLAN §10.1). Rendering only, no gameplay values here. */
export const COLORS = {
  background: '#0f1422',
  gridLine: '#1a2236',
  deposit: '#1e2740',
  hub: '#2b6cb0',
  text: '#ffffff',
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
