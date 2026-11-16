import { describe, expect, it } from 'vitest';
import {
  chunkOf,
  COORD_MAX,
  COORD_MIN,
  DIRS,
  DX,
  DY,
  E,
  key,
  N,
  neighbor,
  normalizeRot,
  opposite,
  rotateDir,
  rotateLocal,
  rotatedSize,
  S,
  unkey,
  W,
} from '../../src/core/grid';

describe('tile keys', () => {
  const samples: [number, number][] = [
    [0, 0],
    [1, -1],
    [-3, 2],
    [COORD_MIN, COORD_MIN],
    [COORD_MAX, COORD_MAX],
    [COORD_MIN, COORD_MAX],
    [COORD_MAX, COORD_MIN],
    [12345, -67890],
  ];

  it('round-trips through unkey', () => {
    for (const [x, y] of samples) expect(unkey(key(x, y))).toEqual({ x, y });
  });

  it('is a safe integer over the whole playable range', () => {
    for (const [x, y] of samples) {
      const k = key(x, y);
      expect(Number.isSafeInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
    }
  });

  it('matches the formula of PLAN §4.1', () => {
    expect(key(0, 0)).toBe(2 ** 20 * 2 ** 21 + 2 ** 20);
    expect(key(5, 7)).toBe((5 + 2 ** 20) * 2 ** 21 + (7 + 2 ** 20));
  });

  it('is unique in a neighbourhood', () => {
    const seen = new Set<number>();
    for (let x = -20; x <= 20; x++) for (let y = -20; y <= 20; y++) seen.add(key(x, y));
    expect(seen.size).toBe(41 * 41);
  });
});

describe('directions', () => {
  it('has unit vectors N E S W with y downward', () => {
    expect([DX[N], DY[N]]).toEqual([0, -1]);
    expect([DX[E], DY[E]]).toEqual([1, 0]);
    expect([DX[S], DY[S]]).toEqual([0, 1]);
    expect([DX[W], DY[W]]).toEqual([-1, 0]);
  });

  it('computes opposites', () => {
    expect(DIRS.map(opposite)).toEqual([S, W, N, E]);
  });

  it('rotates faces clockwise, modulo 4, including negative turns', () => {
    expect(rotateDir(N, 1)).toBe(E);
    expect(rotateDir(W, 1)).toBe(N);
    expect(rotateDir(E, 3)).toBe(N);
    expect(rotateDir(N, -1)).toBe(W);
    for (const d of DIRS) expect(rotateDir(d, 4)).toBe(d);
  });

  it('finds neighbours', () => {
    expect(neighbor(2, 3, N)).toEqual({ x: 2, y: 2 });
    expect(neighbor(2, 3, W)).toEqual({ x: 1, y: 3 });
  });

  it('normalises rotations', () => {
    expect(normalizeRot(5)).toBe(1);
    expect(normalizeRot(-1)).toBe(3);
  });
});

describe('local rotation', () => {
  it('applies (x, y) → (H-1-y, x) for one quarter turn', () => {
    // 3×1 multiplier "A O B": A at (0,0), B at (2,0).
    expect(rotateLocal(0, 0, 3, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(rotateLocal(1, 0, 3, 1, 1)).toEqual({ x: 0, y: 1 });
    expect(rotateLocal(2, 0, 3, 1, 1)).toEqual({ x: 0, y: 2 });
    // 2×2: top-left goes to top-right.
    expect(rotateLocal(0, 0, 2, 2, 1)).toEqual({ x: 1, y: 0 });
    expect(rotateLocal(1, 0, 2, 2, 1)).toEqual({ x: 1, y: 1 });
  });

  it('swaps the box size on odd turns', () => {
    expect(rotatedSize(3, 1, 0)).toEqual({ w: 3, h: 1 });
    expect(rotatedSize(3, 1, 1)).toEqual({ w: 1, h: 3 });
    expect(rotatedSize(3, 1, 2)).toEqual({ w: 3, h: 1 });
    expect(rotatedSize(3, 1, 3)).toEqual({ w: 1, h: 3 });
  });

  it('keeps every tile inside the rotated box and stays a bijection', () => {
    for (const [w, h] of [
      [2, 2],
      [3, 1],
      [2, 3],
      [6, 6],
    ] as const) {
      for (let rot = 0; rot < 4; rot++) {
        const size = rotatedSize(w, h, rot);
        const seen = new Set<string>();
        for (let x = 0; x < w; x++) {
          for (let y = 0; y < h; y++) {
            const p = rotateLocal(x, y, w, h, rot);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThan(size.w);
            expect(p.y).toBeLessThan(size.h);
            seen.add(`${p.x},${p.y}`);
          }
        }
        expect(seen.size).toBe(w * h);
      }
    }
  });

  it('composes: four quarter turns are the identity, two equal a half turn', () => {
    for (let x = 0; x < 3; x++) {
      expect(rotateLocal(x, 0, 3, 1, 4)).toEqual({ x, y: 0 });
      const once = rotateLocal(x, 0, 3, 1, 1);
      expect(rotateLocal(once.x, once.y, 1, 3, 1)).toEqual(rotateLocal(x, 0, 3, 1, 2));
    }
    // Half turn of a 3×1: A (0,0) ends at (2,0).
    expect(rotateLocal(0, 0, 3, 1, 2)).toEqual({ x: 2, y: 0 });
  });

  it('moves an outward face consistently with the tile', () => {
    // A W-facing port on the left edge of a 3×1 must face N after a quarter turn, on the top edge.
    const p = rotateLocal(0, 0, 3, 1, 1);
    const face = rotateDir(W, 1);
    expect(face).toBe(N);
    expect(p.y).toBe(0);
  });
});

describe('chunks', () => {
  it('maps tiles to 32×32 chunks, flooring negatives', () => {
    expect(chunkOf(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOf(31, 31)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOf(32, -1)).toEqual({ cx: 1, cy: -1 });
    expect(chunkOf(-32, -33)).toEqual({ cx: -1, cy: -2 });
  });
});
