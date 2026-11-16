import { MAPGEN } from '../config/balance';

/**
 * A 3×3 deposit. `x`, `y` is its centre tile; it covers `[x-1, x+1] × [y-1, y+1]`.
 */
export interface Deposit {
  x: number;
  y: number;
  value: number;
}

const HALF = (MAPGEN.depositSize - 1) / 2;
/** Two centres must be at least this far apart on one axis (size + gap). */
const MIN_CENTRE_SPACING = MAPGEN.depositSize + MAPGEN.depositGap;

/** True if `a` and `b` overlap or are closer than the required gap. */
export function depositsConflict(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.abs(a.x - b.x) < MIN_CENTRE_SPACING && Math.abs(a.y - b.y) < MIN_CENTRE_SPACING;
}

/** True if any tile of a deposit centred at `(x, y)` lies in the hub clear zone. */
export function inClearZone(x: number, y: number): boolean {
  const { min, max } = MAPGEN.clearZone;
  return x + HALF >= min && x - HALF <= max && y + HALF >= min && y - HALF <= max;
}

/** True if tile `(tx, ty)` belongs to deposit `d`. */
export function depositContains(d: Deposit, tx: number, ty: number): boolean {
  return Math.abs(tx - d.x) <= HALF && Math.abs(ty - d.y) <= HALF;
}

/** A value can be extracted when it is unlocked and is not the forbidden 10 (PLAN §4.5). */
export function isExtractable(value: number, maxExtraction: number): boolean {
  return value >= 1 && value <= maxExtraction && value !== MAPGEN.forbiddenValue;
}

/** Distance of a deposit centre from the hub centre, in tiles. */
export function depositDistance(x: number, y: number): number {
  return Math.hypot(x, y);
}
