import { LEVEL_TABLE, LEVELS } from '../config/balance';
import { hash2, mulberry32 } from '../core/rng';

/** A generated level (PLAN §7.2). Stored in the save up to current level + lookahead. */
export interface GeneratedLevel {
  target: number;
  quantity: number;
  /** True for the last level of the game. */
  final: boolean;
}

/** Salt separating the level stream from map streams. */
const LEVEL_SALT = 0x4c45564c; // "LEVL"

/** One uniform draw for level `n`, independent of how many levels were generated before. */
function levelDraw(seed: number, n: number): number {
  return mulberry32(hash2(seed, LEVEL_SALT, n))();
}

/** Quantity required at level `n`. */
export function quantityFor(n: number): number {
  const def = LEVEL_TABLE[n - 1];
  if (def) return def.quantity;
  return Math.min(
    LEVELS.quantityCap,
    LEVELS.quantityBase + LEVELS.quantityStep * (n - LEVEL_TABLE.length),
  );
}

/** Generate level `n` from the previous level's target. */
export function generateLevel(seed: number, n: number, previousTarget: number): GeneratedLevel {
  const def = LEVEL_TABLE[n - 1];
  let target: number;
  if (def && n <= LEVELS.fixedUntil) {
    target = def.target;
  } else if (def) {
    const { min, max } = LEVELS.tableJitter;
    target = Math.round(def.target * (min + (max - min) * levelDraw(seed, n)));
  } else {
    const { min, max } = LEVELS.infiniteGrowth;
    target = Math.round(previousTarget * (min + (max - min) * levelDraw(seed, n)));
  }
  if (n > 1 && target <= previousTarget) target = previousTarget + 1;
  let final = false;
  if (!def && target > LEVELS.maxTarget) {
    target = Math.max(previousTarget + 1, LEVELS.maxTarget);
    final = true;
  }
  return { target, quantity: quantityFor(n), final };
}

/**
 * Extend `levels` (index 0 = level 1) so it covers `upTo`, stopping after the final level.
 * Mutates and returns the array.
 */
export function ensureLevels(
  seed: number,
  levels: GeneratedLevel[],
  upTo: number,
): GeneratedLevel[] {
  while (levels.length < upTo) {
    const last = levels[levels.length - 1];
    if (last?.final) break;
    levels.push(generateLevel(seed, levels.length + 1, last?.target ?? 0));
  }
  return levels;
}
