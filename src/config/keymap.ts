/** Input bindings and camera feel (PLAN §8.1). Not gameplay balance. */

/** Physical keys (event.code) that pan the camera, per direction. */
export const PAN_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  left: ['KeyA', 'ArrowLeft'],
  down: ['KeyS', 'ArrowDown'],
  right: ['KeyD', 'ArrowRight'],
} as const;

/** Tool / action letters (event.key, case-insensitive). */
export const ACTION_KEYS = {
  home: 'h',
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
