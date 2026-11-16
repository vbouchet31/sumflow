/** Input bindings and camera feel (PLAN §8.1). Not gameplay balance. */

/** Physical keys (event.code) that pan the camera, per direction. */
export const PAN_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  left: ['KeyA', 'ArrowLeft'],
  down: ['KeyS', 'ArrowDown'],
  right: ['KeyD', 'ArrowRight'],
} as const;

/** Action letters (event.key, case-insensitive). Never a physical movement key. */
export const ACTION_KEYS = {
  home: 'h',
  rotate: 'r',
  demolish: 'x',
  levels: 'l',
  upgrades: 'u',
  delivered: 'n',
  priority: 'p',
  clear: 'c',
  marker: 'b',
  pick: 'e',
  mirror: 'f',
} as const;

/** Letters combined with Ctrl (or Cmd), by event.key (PLAN §8.2). */
export const CTRL_KEYS = {
  copy: 'c',
  cut: 'x',
  paste: 'v',
  undo: 'z',
  redo: 'y',
} as const;

/** Tool digits (event.code, so they work on AZERTY without Shift). PLAN §8.2. */
export const TOOL_CODES = {
  Digit1: 'belt',
  Digit2: 'extractor',
  Digit3: 'adder',
  Digit4: 'multiplier',
  Digit5: 'subtractor',
  Digit6: 'divider',
  Digit7: 'exponent',
  Digit8: 'storage',
  Digit9: 'bridge',
} as const;

/** Keys by event.key. */
export const SPECIAL_KEYS = {
  cancel: 'Escape',
  quickDemolish: 'Delete',
  pause: ' ',
} as const;

export const CAMERA = {
  /** Keyboard pan speed in CSS pixels per second (independent of zoom). */
  panSpeedPx: 700,
  /** Multiplier while Shift is held. */
  panShiftFactor: 3,
  minZoom: 0.05,
  maxZoom: 4,
  /** Zoom factor per wheel pixel: zoom *= exp(-deltaY * wheelZoomRate). */
  wheelZoomRate: 0.0015,
} as const;

/** Base size of a tile in CSS pixels at zoom 1 (PLAN §4.1). */
export const TILE_PX = 32;
