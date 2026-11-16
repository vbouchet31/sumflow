/** Grid primitives: tile keys, directions, rotations (PLAN §2, §4.1, §6.1). */

/** Face / direction index: N, E, S, W. */
export type Dir = 0 | 1 | 2 | 3;
/** Clockwise quarter turns. */
export type Rot = 0 | 1 | 2 | 3;

export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;
export const DIRS: readonly Dir[] = [N, E, S, W];

/** Unit vector per direction (`y` grows downward). */
export const DX: readonly [number, number, number, number] = [0, 1, 0, -1];
export const DY: readonly [number, number, number, number] = [-1, 0, 1, 0];

/** Playable coordinate range, inclusive (PLAN §4.1). */
export const COORD_MIN = -500_000;
export const COORD_MAX = 500_000;

/** Chunk edge length in tiles (PLAN §4.1). */
export const CHUNK_SIZE = 32;

const OFFSET = 2 ** 20;
const STRIDE = 2 ** 21;

/** Numeric tile key, a safe integer below 2^53. */
export function key(x: number, y: number): number {
  return (x + OFFSET) * STRIDE + (y + OFFSET);
}

export function unkey(k: number): { x: number; y: number } {
  const y = (k % STRIDE) - OFFSET;
  const x = Math.floor(k / STRIDE) - OFFSET;
  return { x, y };
}

export function isInBounds(x: number, y: number): boolean {
  return x >= COORD_MIN && x <= COORD_MAX && y >= COORD_MIN && y <= COORD_MAX;
}

export function opposite(d: Dir): Dir {
  return ((d + 2) & 3) as Dir;
}

/** Rotate a direction clockwise by `rot` quarter turns. */
export function rotateDir(d: Dir, rot: number): Dir {
  return ((((d + rot) % 4) + 4) % 4) as Dir;
}

export function normalizeRot(rot: number): Rot {
  return (((rot % 4) + 4) % 4) as Rot;
}

export function neighbor(x: number, y: number, d: Dir): { x: number; y: number } {
  return { x: x + DX[d], y: y + DY[d] };
}

/** Size of a `w×h` box after `rot` clockwise quarter turns. */
export function rotatedSize(w: number, h: number, rot: number): { w: number; h: number } {
  return normalizeRot(rot) % 2 === 0 ? { w, h } : { w: h, h: w };
}

/**
 * Rotate a local tile `(x, y)` inside a `w×h` box by `rot` clockwise quarter turns.
 * One quarter turn maps `(x, y) → (H-1-y, x)` and the box becomes `H×W` (PLAN §6.1).
 */
export function rotateLocal(
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
): { x: number; y: number } {
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  for (let i = 0; i < normalizeRot(rot); i++) {
    const nx = ch - 1 - cy;
    cy = cx;
    cx = nx;
    [cw, ch] = [ch, cw];
  }
  return { x: cx, y: cy };
}

/** Chunk coordinates containing tile `(x, y)`. */
export function chunkOf(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}
