/**
 * Decomposition hints of the cost search (PLAN-objets §3.2): for each operation of the
 * registry, which operand pairs `(a, b)` may give a wanted number `n`. A hint only proposes;
 * the operation's own `compute` decides (the search checks every pair it keeps, and a unit
 * test checks every pair of every hint on a range of numbers).
 *
 * Adding an operation to `config/operations.ts` makes this file fail to compile until it has
 * a hint: usually a few lines inverting the operation (a concatenation would split the
 * decimal digits of `n`: `(⌊n / 10^k⌋, n mod 10^k)`). `valuePairs` is a generic fallback.
 *
 * Rules, so the search stays well founded and monotone:
 * - `down` proposes operands both smaller than `n`; `up` may propose a larger one, at most
 *   `ctx.upBound(n)` (`n` + the largest value);
 * - what a hint proposes may depend on the extractable values only through `ctx.values`,
 *   and more values must never remove a proposal (a superset of tools gives a superset of
 *   recipes, hence a cost never higher).
 */
import type { OperationId } from '../config/operations';

export interface HintContext {
  /** Extractable values, ascending. */
  values: readonly number[];
  /** Largest operand an `up` hint may propose for `n`. */
  upBound: (n: number) => number;
  /** Calls `emit(n / d, d)` for every divisor `2 ≤ d ≤ √n` of `n`, ascending. */
  factors: (n: number, emit: Emit) => void;
}

export type Emit = (a: number, b: number) => void;

export interface OperationHint {
  /** Operand pairs both smaller than `n`. */
  down?: (n: number, ctx: HintContext, emit: Emit) => void;
  /** Operand pairs with one operand above `n` (at most `ctx.upBound(n)`). */
  up?: (n: number, ctx: HintContext, emit: Emit) => void;
}

/** Perfect powers `a^e` (a, e ≥ 2) up to `powLimit`, by value: grown on demand. */
let powLimit = 0;
const powers = new Map<number, [number, number][]>();

function ensurePowers(limit: number): void {
  if (limit <= powLimit) return;
  const m = Math.max(limit, powLimit * 2, 1024);
  powers.clear();
  for (let a = 2; a * a <= m; a++) {
    for (let p = a * a, e = 2; p <= m; p *= a, e++) {
      const list = powers.get(p);
      if (list) list.push([a, e]);
      else powers.set(p, [[a, e]]);
    }
  }
  powLimit = m;
}

/** Generic fallback: every pair of extractable values (for an operation without a better hint). */
export function valuePairs(_n: number, ctx: HintContext, emit: Emit): void {
  for (const a of ctx.values) for (const b of ctx.values) emit(a, b);
}

export const OPERATION_HINTS: Readonly<Record<OperationId, OperationHint>> = {
  add: {
    // n = (n − v) + v for every value v, and the balanced split (sums of composites).
    down: (n, ctx, emit) => {
      for (const v of ctx.values) {
        if (v >= n) break;
        emit(n - v, v);
      }
      if (n >= 2) emit(n - Math.floor(n / 2), Math.floor(n / 2));
    },
  },
  mul: {
    // Every factorisation n = (n / d) × d.
    down: (n, ctx, emit) => ctx.factors(n, emit),
  },
  sub: {
    // n = (n + v) − v for every value v.
    up: (n, ctx, emit) => {
      const bound = ctx.upBound(n);
      for (const v of ctx.values) {
        if (n + v > bound) break;
        emit(n + v, v);
      }
    },
  },
  div: {
    // Quotient: n = (n × v) ÷ v, when n × v stays within the upward bound.
    up: (n, ctx, emit) => {
      const bound = ctx.upBound(n);
      for (const v of ctx.values) {
        if (n * v > bound) break;
        if (v >= 2) emit(n * v, v);
      }
    },
  },
  pow: {
    // Perfect powers n = a^e.
    down: (n, _ctx, emit) => {
      if (n < 4) return;
      ensurePowers(n);
      const list = powers.get(n);
      if (list) for (const [a, e] of list) emit(a, e);
    },
  },
};
