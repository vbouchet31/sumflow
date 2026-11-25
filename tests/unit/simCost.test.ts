import { describe, expect, it } from 'vitest';
import { OPERATION_IDS, OPERATIONS, type OperationId } from '../../src/config/operations';
import { mulberry32 } from '../../src/core/rng';
import { createInitialState, type GameState } from '../../src/sim/state';
import {
  computeCosts,
  CostCache,
  type CostTools,
  explain,
  itemCost,
  targetCost,
} from '../../src/simtools/cost';
import { playGame } from '../../src/simtools/game';
import { type HintContext, OPERATION_HINTS, type OperationHint } from '../../src/simtools/hints';
import {
  costTools,
  extractableValues,
  scheduledUpgrades,
  throughputOf,
} from '../../src/simtools/tools';

/** A tool set with explicit prices (raw items free unless `raw` is given). */
function tools(
  maxValue: number,
  ops: Partial<Record<OperationId, number>>,
  raw = 0,
  rawPenalty = 0,
): CostTools {
  return {
    values: extractableValues(maxValue),
    rawBase: raw,
    rawPenalty,
    ops: OPERATION_IDS.flatMap((op) => {
      const price = ops[op];
      return price === undefined ? [] : [{ op, price }];
    }),
  };
}

/** Costs of every target 1..upTo. */
function costs(t: CostTools, upTo: number): number[] {
  const table = computeCosts(t, upTo);
  return Array.from({ length: upTo }, (_, i) => targetCost(t, table, i + 1)[0]);
}

describe('cost search: known cases', () => {
  it('extractable values cost one raw item', () => {
    const t = tools(5, { add: 1 }, 0.5, 0.1);
    expect(itemCost(t, 3)).toBeCloseTo(0.5 * (1 + 0.1 * 2));
    expect(explain(t, 3)).toMatchObject({ ops: {}, raw: { 3: 1 }, expr: '3' });
  });

  it('sums of small values: leaves − 1 additions', () => {
    const t = tools(3, { add: 1 }, 0.1);
    // 7 needs 3 values of at most 3, hence 2 additions.
    expect(itemCost(t, 7)).toBeCloseTo(2 + 3 * 0.1);
    expect(explain(t, 7).ops).toEqual({ add: 2 });
    // 100 with only 1: 99 additions of 100 raw items.
    expect(itemCost(tools(1, { add: 1 }, 0.01), 100)).toBeCloseTo(99 + 100 * 0.01);
  });

  it('products, near products and powers', () => {
    const t = tools(3, { add: 1, mul: 1 });
    expect(itemCost(t, 9)).toBe(1); // 3×3
    expect(itemCost(t, 12)).toBe(2); // e.g. (3×3)+3, nothing in one operation
    const p = tools(3, { add: 10, mul: 10, pow: 1 });
    expect(itemCost(p, 81)).toBe(2); // 3^(2^2) or (3^2)^2
    expect(explain(p, 81).ops).toEqual({ pow: 2 });
  });

  it('an upward last step: n = (n + v) − v', () => {
    const t = tools(23, { add: 1, mul: 1, sub: 0.5 });
    expect(itemCost(t, 527)).toBe(1.5);
    expect(explain(t, 527).expr).toBe('(23×23)−2');
  });

  it('the forbidden value is never extracted', () => {
    expect(extractableValues(12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    const t = tools(12, { add: 1 });
    expect(itemCost(t, 10)).toBe(1);
  });

  it('a number nothing can make costs Infinity, and so do its multiples', () => {
    const t = tools(3, { mul: 1 });
    expect(itemCost(t, 5)).toBe(Infinity);
    expect(itemCost(t, 6)).toBe(1);
    expect(explain(t, 5).expr).toBe('∞');
  });
});

describe('cost search: hints', () => {
  it('every hint of every registry operation proposes pairs that compute the number', () => {
    const values = extractableValues(23);
    const ctx: HintContext = {
      values,
      upBound: (n) => n + 23,
      factors: (n, emit) => {
        for (let d = 2; d * d <= n; d++) if (n % d === 0) emit(n / d, d);
      },
    };
    for (const id of OPERATION_IDS) {
      const def = OPERATIONS[id];
      const hint = OPERATION_HINTS[id];
      for (let n = 1; n <= 800; n++) {
        const check = (a: number, b: number, up: boolean): void => {
          const r = def.compute(a, b);
          expect(
            def.outputs.some((p) => r[p] === n),
            `${id}(${a}, ${b}) = ${n}`,
          ).toBe(true);
          if (!up) expect(Math.max(a, b)).toBeLessThan(n);
          else expect(Math.max(a, b)).toBeLessThanOrEqual(n + 23);
        };
        hint.down?.(n, ctx, (a, b) => check(a, b, false));
        hint.up?.(n, ctx, (a, b) => check(a, b, true));
      }
    }
  });

  it('a wrong proposal is never kept (compute decides)', () => {
    const add = OPERATION_HINTS.add as OperationHint;
    const saved = add.down;
    // A hint lying about 1 + 1: the search must ignore it.
    add.down = (n, ctx, emit) => {
      emit(1, 1);
      saved?.(n, ctx, emit);
    };
    try {
      expect(itemCost(tools(1, { add: 1 }), 5)).toBe(4);
    } finally {
      if (saved) add.down = saved;
    }
  });
});

describe('cost search: monotone', () => {
  const rng = mulberry32(12345);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;

  /** A random tool set and a richer one (more values, one more operation, lower prices). */
  function pair(): [CostTools, CostTools] {
    const maxV = 1 + Math.floor(rng() * 12);
    const ops: Partial<Record<OperationId, number>> = { add: 0.5 + rng() };
    for (const op of OPERATION_IDS) if (op !== 'add' && rng() < 0.5) ops[op] = 0.5 + rng();
    const richer = { ...ops };
    const extra = pick(OPERATION_IDS);
    richer[extra] ??= 0.5 + rng();
    for (const op of OPERATION_IDS) {
      const p = richer[op];
      if (p !== undefined) richer[op] = p * (0.6 + 0.4 * rng());
    }
    const raw = 0.05 + 0.1 * rng();
    return [
      tools(maxV, ops, raw, 0.02),
      tools(maxV + Math.ceil(rng() * 5), richer, raw * 0.9, 0.02),
    ];
  }

  it('more values, operations or lower prices never cost more (random tool sets)', () => {
    for (let k = 0; k < 25; k++) {
      const [a, b] = pair();
      const ca = costs(a, 1500);
      const cb = costs(b, 1500);
      ca.forEach((c, i) => expect(cb[i], `target ${i + 1}`).toBeLessThanOrEqual(c));
    }
  });

  it('each tool alone never costs more', () => {
    const base = tools(5, { add: 1, mul: 1 }, 0.1, 0.02);
    const variants: CostTools[] = [
      tools(6, { add: 1, mul: 1 }, 0.1, 0.02),
      tools(5, { add: 1, mul: 1, sub: 1 }, 0.1, 0.02),
      tools(5, { add: 1, mul: 1, pow: 1 }, 0.1, 0.02),
      tools(5, { add: 1, mul: 1, div: 1 }, 0.1, 0.02),
      tools(5, { add: 0.9, mul: 1 }, 0.1, 0.02),
      tools(5, { add: 1, mul: 1 }, 0.09, 0.02),
    ];
    const c0 = costs(base, 3000);
    for (const v of variants) {
      const c = costs(v, 3000);
      c0.forEach((x, i) => expect(c[i]).toBeLessThanOrEqual(x));
    }
  });
});

describe('cost search: cache and determinism', () => {
  it('cached costs equal fresh ones whatever the query order', () => {
    const t = tools(9, { add: 1, mul: 0.8, sub: 0.9 }, 0.05, 0.02);
    const cache = new CostCache(1.3, 1_000_000);
    const targets = [50, 3000, 7, 2999, 120, 6000, 1];
    const cached = targets.map((n) => cache.itemCost(t, n));
    expect(cached).toEqual(targets.map((n) => itemCost(t, n)));
    // A tiny cache, cleared again and again, gives the same answers.
    const small = new CostCache(1, 4000);
    expect(targets.map((n) => small.itemCost(t, n))).toEqual(cached);
  });

  it('a game is reproducible', () => {
    const play = () =>
      playGame({ seed: 7, strategy: { kind: 'random' }, maxLevel: 25, cache: new CostCache() });
    expect(play()).toEqual(play());
  });
});

/** A state at level `level` with the given tools. */
function stateWith(edit: (s: GameState) => void): GameState {
  const s = createInitialState(1);
  s.unlockedFeatures.push('upgrades');
  s.unlockedBuildings.push('adder', 'multiplier');
  s.maxExtraction = 8;
  edit(s);
  return s;
}

/** Time of one item of `target` from a game state (seconds). */
function itemTime(s: GameState, level: number, target: number): number {
  const { tools: t, capacity } = costTools(s, level);
  return itemCost(t, target) / capacity;
}

describe('tool set of a game state', () => {
  it('upgrades follow a schedule by level only, never going down', () => {
    let prev = scheduledUpgrades(1);
    expect(Object.values(prev).every((l) => l === 1)).toBe(true);
    for (let L = 2; L <= 80; L++) {
      const cur = scheduledUpgrades(L);
      for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
        expect(cur[k]).toBeGreaterThanOrEqual(prev[k]);
      }
      prev = cur;
    }
    expect(scheduledUpgrades(30).adder).toBeGreaterThan(1);
  });

  it('every card kind the model reads never makes an item slower', () => {
    const base = stateWith(() => {});
    const variants = [
      stateWith((s) => (s.maxExtraction = 9)),
      stateWith((s) => s.unlockedBuildings.push('subtractor')),
      stateWith((s) => s.unlockedBuildings.push('exponent')),
      stateWith((s) => s.passives.push('operatorsBoost')),
      stateWith((s) => (s.editionCards.brillante = 1)),
      stateWith((s) => (s.editionCards.legendaire = 2)),
      stateWith((s) => (s.specials['ancientAdder:base'] = 1)),
      stateWith((s) => (s.specials['ancientAdder:legendaire'] = 1)),
    ];
    for (const target of [97, 529, 1234, 4100]) {
      const t0 = itemTime(base, 20, target);
      for (const v of variants) expect(itemTime(v, 20, target)).toBeLessThanOrEqual(t0);
    }
  });

  it('limited copies add their throughput to the ordinary buildings of their operation', () => {
    const s = stateWith((st) => (st.specials['ancientAdder:base'] = 2));
    const t = throughputOf(s, 20);
    const v = t.ordinary.add ?? 0;
    expect(t.limited.add).toBeCloseTo(2 * v); // same track, base edition
    const { tools: priced, capacity } = costTools(s, 20);
    const add = priced.ops.find((o) => o.op === 'add')?.price ?? 0;
    expect(add).toBeCloseTo((1 / v) * (capacity / (capacity + 2)));
  });

  it('an operation only limited buildings perform is capped by their throughput', () => {
    // No ordinary adder: the ancient adders alone add (copies × speed operations per second).
    const level = 20;
    const time = (copies: number): number => {
      const s = createInitialState(1);
      s.maxExtraction = 5;
      s.specials['ancientAdder:base'] = copies;
      return itemTime(s, level, 12);
    };
    const s1 = createInitialState(1);
    s1.specials['ancientAdder:base'] = 1;
    const speed = throughputOf(s1, level).limited.add ?? 0;
    // 12 = 5 + 7 = 5 + (5 + 2): two additions per item, at most `speed` per second.
    expect(time(1)).toBeGreaterThanOrEqual(2 / speed);
    expect(time(1)).toBeLessThan(2 / speed + 1);
    expect(time(2)).toBeLessThan(time(1));
    expect(time(4)).toBeLessThan(time(2));
  });

  it('every level of a game has a finite cost, whatever the strategy', () => {
    const cache = new CostCache();
    for (const strategy of [{ kind: 'natural' }, { kind: 'minimal' }] as const) {
      const g = playGame({ seed: 3, strategy, maxLevel: 60, cache });
      expect(g.times).toHaveLength(60);
      for (const t of g.times) {
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThan(0);
      }
    }
  });

  it('the poorest tool set (value 1, addition) makes any target of the first 60 levels', () => {
    const t = tools(1, { add: 1 }, 0.1);
    const table = computeCosts(t, 40_000);
    expect(Number.isFinite(targetCost(t, table, 40_000)[0])).toBe(true);
  });
});
