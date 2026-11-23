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
  /** Edition tool (PLAN-recompenses §3.5); pressed again, the other variant. */
  edition: 'g',
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
  /**
   * The special building (PLAN-recompenses §4.5): pressed again, its next native edition.
   * Only one special type exists (a placeholder); a second one would need a key of its own.
   */
  Digit0: 'ancientAdder',
} as const;

/** Keys by event.key. */
export const SPECIAL_KEYS = {
  cancel: 'Escape',
  quickDemolish: 'Delete',
  pause: ' ',
  /** Physical key (event.code) of the performance overlay. */
  perf: 'F3',
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

/** Touch gestures (PLAN-tactile §3.2). */
export const TOUCH = {
  /** Movement, in CSS pixels, under which a press is still a tap and not a drag. */
  slopPx: 10,
  /** Time a finger must stay still for a long press. */
  longPressMs: 450,
  /** While building, a finger this close to a screen edge scrolls the map (CSS pixels). */
  edgePx: 56,
  /** Scroll speed at the very edge, in CSS pixels per second. */
  edgeSpeedPx: 700,
  /** Velocity is measured over the last moves of a pan, within this time (ms). */
  inertiaWindowMs: 100,
  /** A finger still for longer than this before lifting does not throw the map (ms). */
  inertiaRestMs: 100,
  /** Slowest release that throws the map, and speed at which the glide stops (px/s). */
  inertiaMinSpeed: 150,
  inertiaStopSpeed: 20,
  /** Time constant of the glide's exponential slow-down (ms). */
  inertiaTauMs: 325,
} as const;

/** Base size of a tile in CSS pixels at zoom 1 (PLAN §4.1). */
export const TILE_PX = 32;
