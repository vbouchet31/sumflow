import { describe, expect, it } from 'vitest';
import type { Track } from '../../src/config/balance';
import {
  type BaseOperatorType,
  BUILDINGS,
  OPERATOR_BUILDINGS,
  operationOf,
  SPECIAL_BUILDINGS,
  trackOf,
} from '../../src/config/buildings';
import {
  OPERATION_IDS,
  OPERATIONS,
  type OperationResult,
  type OutputPort,
} from '../../src/config/operations';
import { add, divmod, INT_MAX, INT_MIN, mul, pow, sub } from '../../src/core/intmath';
import { OPERATOR_TYPES } from '../../src/sim/entities';
import { makeWorld } from './helpers/scenario';

/** Operands covering signs, zero, one, small values and the saturation edges. */
const SAMPLES = [INT_MIN, -100_000, -17, -5, -2, -1, 0, 1, 2, 3, 5, 7, 17, 31, 100_000, INT_MAX];

/** The ordinary operators as they were before the registry (phase 1): computation, symbol, track. */
const LEGACY: Record<
  BaseOperatorType,
  { compute: (a: number, b: number) => OperationResult; symbol: string; track: Track }
> = {
  adder: { compute: (a, b) => ({ O: add(a, b) }), symbol: '+', track: 'adder' },
  multiplier: { compute: (a, b) => ({ O: mul(a, b) }), symbol: '×', track: 'multiplier' },
  subtractor: { compute: (a, b) => ({ O: sub(a, b) }), symbol: '−', track: 'subdiv' },
  divider: {
    compute: (a, b) => {
      const { q, r } = divmod(a, b);
      return r === 0 ? { Q: q } : { Q: q, R: r };
    },
    symbol: '÷',
    track: 'subdiv',
  },
  exponent: { compute: (a, b) => ({ O: pow(a, b) }), symbol: '^', track: 'exponent' },
};

describe('operations registry', () => {
  it('declares each operation under its own id, with valid ports', () => {
    expect(OPERATION_IDS).toEqual(['add', 'mul', 'sub', 'div', 'pow', 'concat']);
    for (const id of OPERATION_IDS) {
      const op = OPERATIONS[id];
      expect(op.id).toBe(id);
      expect(op.inputs).toEqual(['A', 'B']);
      expect(op.outputs.length).toBeGreaterThan(0);
      expect(new Set(op.outputs).size).toBe(op.outputs.length);
      expect(op.symbol.length).toBeGreaterThan(0);
    }
  });

  it('computes saturated integers, only on declared outputs, and the main output always', () => {
    for (const id of OPERATION_IDS) {
      const op = OPERATIONS[id];
      for (const a of SAMPLES) {
        for (const b of SAMPLES) {
          const res = op.compute(a, b);
          const ports = Object.keys(res) as OutputPort[];
          for (const p of ports) {
            expect(op.outputs).toContain(p);
            const v = res[p] ?? NaN;
            expect(Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX).toBe(true);
            expect(Object.is(v, -0)).toBe(false);
          }
          // The first output is always emitted (the divider's R may be left out).
          expect(ports).toContain(op.outputs[0]);
        }
      }
    }
  });

  it('flags commutativity truthfully', () => {
    for (const id of OPERATION_IDS) {
      const op = OPERATIONS[id];
      let symmetric = true;
      for (const a of SAMPLES) {
        for (const b of SAMPLES) {
          if (JSON.stringify(op.compute(a, b)) !== JSON.stringify(op.compute(b, a))) {
            symmetric = false;
          }
        }
      }
      expect(symmetric, id).toBe(op.commutative);
    }
  });

  it('the divider emits R only when non-zero', () => {
    expect(OPERATIONS.div.outputs).toEqual(['Q', 'R']);
    expect(OPERATIONS.div.compute(17, 5)).toEqual({ Q: 3, R: 2 });
    expect(OPERATIONS.div.compute(20, 5)).toEqual({ Q: 4 });
    expect(OPERATIONS.div.compute(9, 0)).toEqual({ Q: 0, R: 9 });
  });
});

describe('buildings perform an operation of the registry', () => {
  it('every operator type, ordinary or special, declares an operation', () => {
    const declared = { ...OPERATOR_BUILDINGS, ...SPECIAL_BUILDINGS };
    expect(Object.keys(declared).sort()).toEqual([...OPERATOR_TYPES].sort());
    for (const t of OPERATOR_TYPES) expect(OPERATIONS[declared[t].op]).toBe(operationOf(t));
  });

  it('footprint ports match the operation: A and B in, its outputs out', () => {
    for (const t of OPERATOR_TYPES) {
      const op = operationOf(t);
      const roles = new Set(BUILDINGS[t].tiles.map((tile) => tile.role));
      roles.delete('body');
      expect([...roles].sort(), t).toEqual([...op.inputs, ...op.outputs].sort());
    }
  });

  it('changes nothing from phase 1: same results, symbols and tracks', () => {
    for (const t of Object.keys(LEGACY) as BaseOperatorType[]) {
      const legacy = LEGACY[t];
      expect(operationOf(t).symbol, t).toBe(legacy.symbol);
      expect(trackOf(t), t).toBe(legacy.track);
      for (const a of SAMPLES) {
        for (const b of SAMPLES) expect(operationOf(t).compute(a, b)).toEqual(legacy.compute(a, b));
      }
    }
  });

  it('a new building gets one buffer per output of its operation', () => {
    const world = makeWorld();
    const div = world.addBuilding('divider', 20, 20, 0);
    expect(div.outQ).toEqual([]);
    expect(div.outR).toEqual([]);
    expect(div.out).toBeUndefined();
    const cat = world.addBuilding('concat', 30, 20, 0);
    expect(cat.out).toEqual([]);
    expect(cat.outQ).toBeUndefined();
  });
});

describe('concatenation (docs/objets/concat.md)', () => {
  const cat = (a: number, b: number): number | undefined => OPERATIONS.concat.compute(a, b).O;

  it('writes the digits of B after those of A', () => {
    expect(cat(4, 7)).toBe(47);
    expect(cat(89, 1)).toBe(891);
    expect(cat(1, 23)).toBe(123);
    expect(cat(12, 345)).toBe(12_345);
    expect(cat(4, 100)).toBe(4_100);
    expect(cat(7, 7)).toBe(77);
  });

  it('B = 0 counts as one digit, A = 0 gives |B|', () => {
    expect(cat(4, 0)).toBe(40);
    expect(cat(-4, 0)).toBe(-40);
    expect(cat(0, 7)).toBe(7);
    expect(cat(0, -7)).toBe(7);
    expect(cat(0, 0)).toBe(0);
    expect(Object.is(cat(0, 0), -0)).toBe(false);
  });

  it('ignores the sign of B and keeps the sign of A', () => {
    expect(cat(4, -7)).toBe(47);
    expect(cat(-4, 7)).toBe(-47);
    expect(cat(-4, -7)).toBe(-47);
    expect(cat(-12, 34)).toBe(-1_234);
  });

  it('saturates like the other operations', () => {
    expect(cat(214_748, 3_647)).toBe(INT_MAX);
    expect(cat(214_748, 3_648)).toBe(INT_MAX);
    expect(cat(-214_748, 3_648)).toBe(INT_MIN);
    expect(cat(INT_MAX, 1)).toBe(INT_MAX);
    expect(cat(INT_MIN, 1)).toBe(INT_MIN);
    expect(cat(1, INT_MIN)).toBe(INT_MAX);
    expect(cat(0, INT_MIN)).toBe(INT_MAX);
    expect(cat(-1, INT_MIN)).toBe(INT_MIN);
    expect(cat(21, 47_483_647)).toBe(INT_MAX);
    expect(cat(21, 47_483_646)).toBe(2_147_483_646);
  });

  it('is not commutative, on the multiplier track, with one output', () => {
    expect(OPERATIONS.concat).toMatchObject({
      symbol: '‖',
      commutative: false,
      track: 'multiplier',
      outputs: ['O'],
    });
    expect(cat(4, 7)).not.toBe(cat(7, 4));
  });
});
