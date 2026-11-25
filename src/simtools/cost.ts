/**
 * Cost search of the simulator (PLAN-objets §3.2, point 1): the time one item of a number
 * takes with a given tool set. Driven by the operations registry (`compute`) and the
 * decomposition hints (`hints.ts`); no operation is named here.
 *
 * A recipe is a tree: leaves are raw items (extractable values), nodes are operations. Its
 * cost is the sum of its operation prices and raw item prices. The search is a dynamic
 * programme over the numbers `1..N`:
 * - `down[n]`: the cheapest recipe whose every operation has operands smaller than its
 *   result, among the pairs the `down` hints propose (exact minimum, ascending order);
 * - the cost of a target adds one "upward" last step (`up` hints, `n = (n + v) − v`), whose
 *   operands are `down` recipes.
 * Each is an exact minimum over a family of trees that only grows with the tools (hints never
 * drop a proposal when values are added; an operation adds proposals; prices only go down),
 * so the cost is **monotone**: more values, more operations or lower prices never cost more.
 * It is deterministic and memoised by tool set; a table does not depend on how far it was
 * computed, so the cache never changes a result.
 */
import { OPERATIONS, type OperationDef, type OperationId } from '../config/operations';
import { type Emit, type HintContext, OPERATION_HINTS } from './hints';

/** An operation available to the search, with the time one use of it costs. */
export interface PricedOperation {
  op: OperationId;
  price: number;
}

/** What the search knows of a tool set. */
export interface CostTools {
  /** Extractable values, ascending, all ≥ 1. */
  values: readonly number[];
  /** Price of a raw item of value v: `rawBase × (1 + rawPenalty × (v − 1))`. */
  rawBase: number;
  rawPenalty: number;
  /** Available operations (at most one entry per operation). */
  ops: readonly PricedOperation[];
}

/** Price of a raw item of value `v`. */
export function rawPrice(tools: CostTools, v: number): number {
  return tools.rawBase * (1 + tools.rawPenalty * (v - 1));
}

// --- Divisors (shared, grown on demand) -------------------------------------------------

let divLimit = 0;
let divStart = new Int32Array(1);
let divList = new Int32Array(0);

/** Divisors 2 ≤ d ≤ √n of every n up to `limit`, as compressed rows. */
function ensureDivisors(limit: number): void {
  if (limit <= divLimit) return;
  const m = Math.max(limit, divLimit * 2, 1024);
  const count = new Int32Array(m + 2);
  for (let d = 2; d * d <= m; d++) {
    for (let k = d * d; k <= m; k += d) count[k + 1] = (count[k + 1] ?? 0) + 1;
  }
  const start = new Int32Array(m + 2);
  for (let n = 1; n <= m + 1; n++) start[n] = (start[n - 1] ?? 0) + (count[n] ?? 0);
  const list = new Int32Array(start[m + 1] ?? 0);
  const fill = start.slice();
  for (let d = 2; d * d <= m; d++) {
    for (let k = d * d; k <= m; k += d) {
      const at = fill[k] ?? 0;
      list[at] = d;
      fill[k] = at + 1;
    }
  }
  divLimit = m;
  divStart = start;
  divList = list;
}

function factors(n: number, emit: Emit): void {
  if (n > divLimit) ensureDivisors(n);
  const end = divStart[n + 1] ?? 0;
  for (let i = divStart[n] ?? 0; i < end; i++) {
    const d = divList[i] ?? 1;
    emit(n / d, d);
  }
}

// --- Search ---------------------------------------------------------------------------

/** How a number is made: an operation (index in `tools.ops`) on `a` and `b`, or raw (-1). */
export interface Choice {
  op: number;
  a: number;
  b: number;
}

/** `down` costs of the numbers `0..limit` (index 0 unused, Infinity if it cannot be made). */
export interface CostTable {
  down: Float64Array;
  /** Largest target the table answers (`limit` minus the largest value). */
  upTo: number;
  /** Recipes, when asked for (`explain`). */
  choices?: Choice[];
}

/** Does `def.compute(a, b)` emit `n` on one of its outputs? */
function yields(def: OperationDef, a: number, b: number, n: number): boolean {
  const r = def.compute(a, b);
  for (const port of def.outputs) if (r[port] === n) return true;
  return false;
}

function hintContext(tools: CostTools): HintContext {
  const maxValue = tools.values[tools.values.length - 1] ?? 0;
  return { values: tools.values, upBound: (n) => n + maxValue, factors };
}

function pricedOps(tools: CostTools) {
  return tools.ops.map((o, index) => ({
    index,
    price: o.price,
    def: OPERATIONS[o.op],
    hint: OPERATION_HINTS[o.op],
  }));
}

/** `down` costs of every number up to `upTo` + the largest value (see the file comment). */
export function computeCosts(tools: CostTools, upTo: number, withChoices = false): CostTable {
  const maxValue = tools.values[tools.values.length - 1] ?? 0;
  const limit = upTo + maxValue;
  ensureDivisors(limit);
  const isValue = new Uint8Array(limit + 1);
  for (const v of tools.values) if (v >= 1 && v <= limit) isValue[v] = 1;
  const ctx = hintContext(tools);
  const ops = pricedOps(tools).filter((o) => o.hint.down);
  const down = new Float64Array(limit + 1).fill(Infinity);
  const choices: Choice[] = [];

  // Per operation, the cheapest proposal is kept unchecked; only that one is checked with
  // `compute` (a wrong one makes the proposals of that operation be checked one by one).
  let n = 0;
  let price = 0;
  let def: OperationDef = OPERATIONS.add;
  let checkAll = false;
  let cost = Infinity;
  let bestA = 0;
  let bestB = 0;
  const emit: Emit = (a, b) => {
    if (a < 1 || b < 1 || a >= n || b >= n) return;
    const c = price + (down[a] ?? Infinity) + (down[b] ?? Infinity);
    if (c < cost && (!checkAll || yields(def, a, b, n))) {
      cost = c;
      bestA = a;
      bestB = b;
    }
  };
  for (n = 1; n <= limit; n++) {
    let nCost = isValue[n] === 1 ? rawPrice(tools, n) : Infinity;
    let pick = -1;
    let pickA = n;
    let pickB = 0;
    for (const o of ops) {
      price = o.price;
      def = o.def;
      cost = nCost;
      checkAll = false;
      o.hint.down?.(n, ctx, emit);
      if (cost < nCost && !yields(def, bestA, bestB, n)) {
        cost = nCost;
        checkAll = true;
        o.hint.down?.(n, ctx, emit);
      }
      if (cost < nCost) {
        nCost = cost;
        pick = o.index;
        pickA = bestA;
        pickB = bestB;
      }
    }
    down[n] = nCost;
    if (withChoices) choices[n] = { op: pick, a: pickA, b: pickB };
  }
  const table: CostTable = { down, upTo };
  if (withChoices) table.choices = choices;
  return table;
}

/** Cost of `target` from its table: its `down` recipe or one upward last step. */
function targetCost(tools: CostTools, table: CostTable, target: number): [number, Choice] {
  const down = table.down;
  let cost = down[target] ?? Infinity;
  let pick: Choice = { op: -2, a: target, b: 0 };
  const ctx = hintContext(tools);
  const bound = ctx.upBound(target);
  for (const o of pricedOps(tools)) {
    o.hint.up?.(target, ctx, (a, b) => {
      if (a < 1 || b < 1 || a > bound || b > bound) return;
      const c = o.price + (down[a] ?? Infinity) + (down[b] ?? Infinity);
      if (c < cost && yields(o.def, a, b, target)) {
        cost = c;
        pick = { op: o.index, a, b };
      }
    });
  }
  return [cost, pick];
}

/** Time of one item of `target` with `tools` (no cache). */
export function itemCost(tools: CostTools, target: number): number {
  return targetCost(tools, computeCosts(tools, target), target)[0];
}

/** A recipe, unfolded: operations used and raw items, per item of the target. */
export interface Recipe {
  cost: number;
  /** Uses of each operation. */
  ops: Partial<Record<OperationId, number>>;
  /** Raw items by value. */
  raw: Record<number, number>;
  /** Readable expression, e.g. `(23×24)+5`. */
  expr: string;
}

/** The best recipe of `target` with `tools`, unfolded (tests and reports). */
export function explain(tools: CostTools, target: number): Recipe {
  const table = computeCosts(tools, target, true);
  const [cost, root] = targetCost(tools, table, target);
  const recipe: Recipe = { cost, ops: {}, raw: {}, expr: '∞' };
  const choices = table.choices;
  if (!choices || !Number.isFinite(cost)) return recipe;
  const walk = (x: number, c: Choice | undefined, top: boolean): string => {
    const priced = c ? tools.ops[c.op] : undefined;
    if (!c || !priced) {
      recipe.raw[x] = (recipe.raw[x] ?? 0) + 1;
      return String(x);
    }
    recipe.ops[priced.op] = (recipe.ops[priced.op] ?? 0) + 1;
    const text = `${walk(c.a, choices[c.a], false)}${OPERATIONS[priced.op].symbol}${walk(c.b, choices[c.b], false)}`;
    return top ? text : `(${text})`;
  };
  recipe.expr = walk(target, root.op === -2 ? choices[target] : root, true);
  return recipe;
}

/** Key of a tool set in the cache: everything a table depends on. */
export function toolsKey(tools: CostTools): string {
  const ops = tools.ops.map((o) => `${o.op}:${o.price}`).join(',');
  return `${tools.values.join(',')}|${tools.rawBase}|${tools.rawPenalty}|${ops}`;
}

/**
 * Memoised costs: one table per tool set, computed up to `margin × target` so the targets of
 * other games at the same level reuse it. Results never depend on the cache state.
 */
export class CostCache {
  private tables = new Map<string, CostTable>();
  private numbers = 0;
  /** Tables computed (for the timing report). */
  computed = 0;
  queries = 0;

  constructor(
    private readonly margin = 1.3,
    private readonly maxNumbers = 12_000_000,
  ) {}

  /** Time of one item of `target` with `tools`. */
  itemCost(tools: CostTools, target: number): number {
    this.queries += 1;
    const key = toolsKey(tools);
    let table = this.tables.get(key);
    if (!table || table.upTo < target) {
      const upTo = Math.max(Math.ceil(target * this.margin), (table?.upTo ?? 0) * 2);
      if (table) {
        this.numbers -= table.upTo;
        this.tables.delete(key);
      }
      if (this.numbers + upTo > this.maxNumbers) {
        this.tables.clear();
        this.numbers = 0;
      }
      table = computeCosts(tools, upTo);
      this.computed += 1;
      this.tables.set(key, table);
      this.numbers += upTo;
    }
    return targetCost(tools, table, target)[0];
  }
}
