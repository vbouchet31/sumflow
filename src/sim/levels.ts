import {
  LEVEL_TABLE,
  LEVELS,
  PALIERS,
  QUANTITY_FACTOR,
  QUANTITY_ROUNDING,
} from '../config/balance';
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

/** The last entry of `ranges` whose `from` is at most `n`, or undefined. */
function rangeAt<T extends { from: number }>(ranges: readonly T[], n: number): T | undefined {
  let found: T | undefined;
  for (const r of ranges) if (r.from <= n && (!found || r.from >= found.from)) found = r;
  return found;
}

/** Quantity factor of level `n` (PLAN-paliers §3.3). */
export function quantityFactor(
  n: number,
  ranges: readonly { from: number; factor: number }[] = QUANTITY_FACTOR,
): number {
  return rangeAt(ranges, n)?.factor ?? 1;
}

/** Base quantity of level `n`: the table, then the infinite formula. */
function baseQuantity(n: number): number {
  const def = LEVEL_TABLE[n - 1];
  if (def) return def.quantity;
  return Math.min(
    LEVELS.quantityCap,
    LEVELS.quantityBase + LEVELS.quantityStep * (n - LEVEL_TABLE.length),
  );
}

/** Quantity required at level `n`: its base quantity times its factor, rounded. */
export function quantityFor(
  n: number,
  ranges: readonly { from: number; factor: number }[] = QUANTITY_FACTOR,
): number {
  const base = baseQuantity(n);
  const factor = quantityFactor(n, ranges);
  if (factor === 1) return base;
  return Math.max(1, Math.round((base * factor) / QUANTITY_ROUNDING) * QUANTITY_ROUNDING);
}

/** Palier fractions of level `n` (PLAN-paliers §3.2), increasing; empty before the first range. */
export function paliersFor(
  n: number,
  ranges: readonly { from: number; at: readonly number[] }[] = PALIERS,
): readonly number[] {
  return rangeAt(ranges, n)?.at ?? [];
}

/** First level with at least one palier, or Infinity if none. */
export function firstPalierLevel(
  ranges: readonly { from: number; at: readonly number[] }[] = PALIERS,
): number {
  let first = Infinity;
  for (const r of ranges) if (r.at.length > 0) first = Math.min(first, r.from);
  return first;
}

/** Delivered counts at which the paliers of a level of `quantity` items are reached. */
export function palierThresholds(fractions: readonly number[], quantity: number): number[] {
  return fractions.map((f) => Math.max(1, Math.ceil(f * quantity - 1e-9)));
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
