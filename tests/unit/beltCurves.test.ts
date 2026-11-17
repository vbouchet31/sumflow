import { describe, expect, it } from 'vitest';
import { E, N, S, W } from '../../src/core/grid';
import { curveOf, curvePoint, straightInputs } from '../../src/render/layers/belts';

const m = (...dirs: number[]): number => dirs.reduce((a, d) => a | (1 << d), 0);

describe('belt curves', () => {
  it('a single output fed at a right angle is a turn', () => {
    expect(curveOf(m(S), m(W))).toEqual({ from: W, to: S });
    expect(curveOf(m(E), m(N))).toEqual({ from: N, to: E });
  });

  it('straight, split, merge and unfed belts are not turns', () => {
    expect(curveOf(m(E), m(W))).toBeNull();
    expect(curveOf(m(E, S), m(W))).toBeNull();
    expect(curveOf(m(E), m(N, S))).toBeNull();
    expect(curveOf(m(E), 0)).toBeNull();
  });

  it('a turn starts at the entry side midpoint and ends at the exit side midpoint', () => {
    // Enters from the west side, leaves through the south side.
    const a = curvePoint(W, S, 0);
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(0.5);
    expect(a.fx).toBeCloseTo(1);
    expect(a.fy).toBeCloseTo(0);
    const b = curvePoint(W, S, 1);
    expect(b.x).toBeCloseTo(0.5);
    expect(b.y).toBeCloseTo(1);
    expect(b.fx).toBeCloseTo(0);
    expect(b.fy).toBeCloseTo(1);
  });

  it('bridge lanes are fed from straight behind', () => {
    expect(straightInputs({ outputs: m(E) } as never)).toBe(m(W));
  });
});
