import { describe, expect, it } from 'vitest';
import { E, N, S, W } from '../../src/core/grid';
import { BELT_SHAPE } from '../../src/config/colors';
import { curveOf, curvePoint, straightInputs, turnRadius } from '../../src/render/layers/belts';

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

  it('a turn ends at the side midpoints whatever its radius', () => {
    for (const r of [0, 0.07, 0.25, 0.5]) {
      const a = curvePoint(N, E, 0, r);
      expect([a.x, a.y, a.fx, a.fy].map((v) => +v.toFixed(6))).toEqual([0.5, 0, 0, 1]);
      const b = curvePoint(N, E, 1, r);
      expect([b.x, b.y, b.fx, b.fy].map((v) => +v.toFixed(6))).toEqual([1, 0.5, 1, 0]);
    }
  });

  it('a full radius turn is a quarter circle around the tile corner', () => {
    // Enters from the west, leaves through the south: centred on the bottom-left corner.
    for (const t of [0.25, 0.5, 0.75]) {
      const p = curvePoint(W, S, t, 0.5);
      expect(Math.hypot(p.x - 0, p.y - 1)).toBeCloseTo(0.5);
    }
    const mid = curvePoint(W, S, 0.5, 0.5);
    expect(mid.fx).toBeCloseTo(Math.SQRT1_2);
    expect(mid.fy).toBeCloseTo(Math.SQRT1_2);
  });

  it('a tighter turn runs straight, bends around the centre, then runs straight', () => {
    const r = 0.2;
    const total = 2 * (0.5 - r) + (Math.PI / 2) * r;
    // Still on the entry run: heading east along the centre line.
    const early = curvePoint(W, S, (0.5 - r) / total - 0.01, r);
    expect(early.y).toBeCloseTo(0.5);
    expect(early.fx).toBeCloseTo(1);
    // Already on the exit run: heading south along the centre line.
    const late = curvePoint(W, S, 1 - (0.5 - r) / total + 0.01, r);
    expect(late.x).toBeCloseTo(0.5);
    expect(late.fy).toBeCloseTo(1);
    // Halfway: on the arc, closer to the tile centre than the full quarter circle is.
    const mid = curvePoint(W, S, 0.5, r);
    expect(Math.hypot(mid.x - 0.5, mid.y - 0.5)).toBeLessThan(
      Math.hypot(curvePoint(W, S, 0.5, 0.5).x - 0.5, curvePoint(W, S, 0.5, 0.5).y - 0.5),
    );
  });

  it('a square turn passes through the tile centre', () => {
    const p = curvePoint(W, S, 0.5, 0);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });

  it('the centre line radius follows the outer corner, within the tile', () => {
    expect(turnRadius({ corner: 0.88, band: 0.38 })).toBeCloseTo(0.5);
    expect(turnRadius({ corner: 0.45, band: 0.38 })).toBeCloseTo(0.07);
    expect(turnRadius({ corner: 0.2, band: 0.38 })).toBe(0);
    expect(turnRadius({ corner: 2, band: 0.38 })).toBe(0.5);
  });

  it('the belt shape settings stay in range', () => {
    expect(BELT_SHAPE.surface).toBeLessThan(BELT_SHAPE.band);
    expect(BELT_SHAPE.band).toBeLessThan(0.5);
    expect(BELT_SHAPE.corner).toBeGreaterThanOrEqual(0);
    expect(BELT_SHAPE.corner).toBeLessThanOrEqual(0.5 + BELT_SHAPE.band);
    expect(BELT_SHAPE.cap).toBeGreaterThanOrEqual(0);
    expect(BELT_SHAPE.cap).toBeLessThanOrEqual(1);
  });

  it('bridge lanes are fed from straight behind', () => {
    expect(straightInputs({ outputs: m(E) } as never)).toBe(m(W));
  });
});
