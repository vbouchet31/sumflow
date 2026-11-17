import { add, divmod, mul, pow, sub } from '../core/intmath';
import { isExtractable } from '../world/deposits';
import type { GameState } from './state';

/** Operators the oracle may use, as the player knows them (proposal 05). */
export type OracleOp = '+' | '×' | '−' | '÷' | '%' | '^';

/** An expression tree: a raw number from a deposit, or an operation on two sub-trees. */
export type Recipe =
  | { kind: 'leaf'; value: number }
  | { kind: 'op'; op: OracleOp; a: Recipe; b: Recipe; value: number };

export interface OracleOptions {
  /** Most deposits (leaves) in a recipe. */
  maxLeaves: number;
  /** Largest intermediate value kept, as a multiple of the target (plus a margin). */
  valueFactor: number;
  /** Most distinct values kept per leaf count (bounds time and memory). */
  maxPerLevel: number;
  /** Most recipes returned. */
  maxResults: number;
}

export const ORACLE_DEFAULTS: OracleOptions = {
  maxLeaves: 5,
  valueFactor: 4,
  maxPerLevel: 6_000,
  maxResults: 3,
};

function apply(op: OracleOp, a: number, b: number): number | null {
  switch (op) {
    case '+':
      return add(a, b);
    case '×':
      return mul(a, b);
    case '−':
      return sub(a, b);
    case '÷':
      return b === 0 ? null : divmod(a, b).q;
    case '%':
      return b === 0 ? null : divmod(a, b).r;
    case '^':
      return b > 30 ? null : pow(a, b);
  }
}

/** Operators unlocked in this game. */
export function unlockedOps(state: GameState): OracleOp[] {
  const u = state.unlockedBuildings;
  const ops: OracleOp[] = [];
  if (u.includes('adder')) ops.push('+');
  if (u.includes('multiplier')) ops.push('×');
  if (u.includes('subtractor')) ops.push('−');
  if (u.includes('divider')) ops.push('÷', '%');
  if (u.includes('exponent')) ops.push('^');
  return ops;
}

/** Numbers that can be extracted right now. */
export function extractableValues(state: GameState): number[] {
  const out: number[] = [];
  for (let v = 1; v <= state.maxExtraction; v++)
    if (isExtractable(v, state.maxExtraction)) out.push(v);
  return out;
}

/**
 * Shortest recipes (fewest deposits) that build `target` from `bases` with `ops`. Breadth
 * first by number of leaves: every value is first reached with as few leaves as possible,
 * and only that first way is kept to combine further. At the winning size, up to
 * `maxResults` different ways are returned. Empty when nothing is found within the limits.
 */
export function findRecipes(
  target: number,
  bases: readonly number[],
  ops: readonly OracleOp[],
  options: Partial<OracleOptions> = {},
): Recipe[] {
  const o = { ...ORACLE_DEFAULTS, ...options };
  const leaves = bases.map((value): Recipe => ({ kind: 'leaf', value }));
  const direct = leaves.find((l) => l.value === target);
  if (direct) return [direct];
  const limit = Math.max(1_000, Math.abs(target) * o.valueFactor);
  const seen = new Set<number>(bases);
  /** levels[k]: recipes using exactly k leaves, one per value. */
  const levels: Recipe[][] = [[], leaves];
  for (let k = 2; k <= o.maxLeaves; k++) {
    const found: Recipe[] = [];
    const foundKeys = new Set<string>();
    const next: Recipe[] = [];
    for (let i = 1; i < k; i++) {
      const left = levels[i] ?? [];
      const right = levels[k - i] ?? [];
      for (const a of left) {
        for (const b of right) {
          for (const op of ops) {
            // + and × commute: one order is enough.
            if ((op === '+' || op === '×') && i > k - i) continue;
            if ((op === '+' || op === '×') && i === k - i && a.value > b.value) continue;
            const v = apply(op, a.value, b.value);
            if (v === null) continue;
            if (v === target) {
              const r: Recipe = { kind: 'op', op, a, b, value: v };
              const key = recipeText(r);
              if (!foundKeys.has(key) && found.length < o.maxResults) {
                foundKeys.add(key);
                found.push(r);
              }
              continue;
            }
            if (v <= 0 || v > limit || seen.has(v) || next.length >= o.maxPerLevel) continue;
            seen.add(v);
            next.push({ kind: 'op', op, a, b, value: v });
          }
        }
      }
    }
    if (found.length > 0) return found;
    levels.push(next);
  }
  return [];
}

/** Infix text with the parentheses a reader needs ("(3 + 5) × 6"). */
export function recipeText(r: Recipe): string {
  if (r.kind === 'leaf') return String(r.value);
  const wrap = (x: Recipe): string => (x.kind === 'leaf' ? recipeText(x) : `(${recipeText(x)})`);
  return `${wrap(r.a)} ${r.op} ${wrap(r.b)}`;
}

/** Number of deposits a recipe reads (several can come from one extractor). */
export function leafCount(r: Recipe): number {
  return r.kind === 'leaf' ? 1 : leafCount(r.a) + leafCount(r.b);
}

/** Number of operators to build. */
export function opCount(r: Recipe): number {
  return r.kind === 'leaf' ? 0 : 1 + opCount(r.a) + opCount(r.b);
}
