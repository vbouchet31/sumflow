import { describe, expect, it } from 'vitest';
import { guaranteedRule, MAPGEN } from '../../src/config/balance';
import { CHUNK_SIZE } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { DepositMap } from '../../src/world/chunks';
import {
  type Deposit,
  depositDistance,
  depositsConflict,
  inClearZone,
  isExtractable,
} from '../../src/world/deposits';
import { drawValue, generateGuaranteed, vmaxAt } from '../../src/world/mapgen';

const SEEDS = [0, 1, 42, 123456789, 0xdeadbeef, 2 ** 32 - 1];

/** All deposits of chunks in [-r, r]², generated in the given order. */
function collect(map: DepositMap, r: number, order: 'forward' | 'reverse' | 'spiral'): Deposit[] {
  const coords: [number, number][] = [];
  for (let cy = -r; cy <= r; cy++) for (let cx = -r; cx <= r; cx++) coords.push([cx, cy]);
  if (order === 'reverse') coords.reverse();
  if (order === 'spiral') coords.sort((a, b) => Math.hypot(...b) - Math.hypot(...a));
  for (const [cx, cy] of coords) map.getChunk(cx, cy);
  const all: Deposit[] = [];
  for (let cy = -r; cy <= r; cy++)
    for (let cx = -r; cx <= r; cx++) all.push(...map.getChunk(cx, cy));
  return all;
}

describe('guaranteed deposits (step A)', () => {
  it('places the right count per value, never 10', () => {
    for (const seed of SEEDS) {
      const g = generateGuaranteed(seed);
      for (let v = 1; v <= 80; v++) {
        const count = g.filter((d) => d.value === v).length;
        expect(count).toBe(guaranteedRule(v)?.count ?? 0);
      }
      expect(g.some((d) => d.value === 10)).toBe(false);
    }
  });

  it('respects the distance ranges (pushed out by at most a few retries)', () => {
    for (const seed of SEEDS) {
      for (const d of generateGuaranteed(seed)) {
        const rule = guaranteedRule(d.value);
        if (!rule) throw new Error('unexpected value');
        const dist = depositDistance(d.x, d.y);
        expect(dist).toBeGreaterThanOrEqual(rule.minDist - 1);
        expect(dist).toBeLessThanOrEqual(rule.maxDist + 3 * MAPGEN.retryDistanceStep + 1);
      }
    }
  });

  it('puts four 1s, one per quadrant, less than 16 tiles from the hub', () => {
    for (const seed of SEEDS) {
      const ones = generateGuaranteed(seed).filter((d) => d.value === 1);
      expect(ones.filter((d) => depositDistance(d.x, d.y) < 16.5).length).toBeGreaterThanOrEqual(4);
      const quadrants = new Set(ones.map((d) => `${Math.sign(d.x) >= 0}${Math.sign(d.y) >= 0}`));
      expect(quadrants.size).toBe(4);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(generateGuaranteed(42)).toEqual(generateGuaranteed(42));
    expect(generateGuaranteed(42)).not.toEqual(generateGuaranteed(43));
  });
});

describe('deposit map (step B)', () => {
  it('same seed ⇒ same deposits', () => {
    for (const seed of SEEDS) {
      expect(collect(new DepositMap(seed), 4, 'forward')).toEqual(
        collect(new DepositMap(seed), 4, 'forward'),
      );
    }
  });

  it('chunk generation order has no effect', () => {
    for (const seed of SEEDS) {
      const a = collect(new DepositMap(seed), 5, 'forward');
      const b = collect(new DepositMap(seed), 5, 'reverse');
      const c = collect(new DepositMap(seed), 5, 'spiral');
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it('never overlaps, keeps a 1-tile gap, avoids the clear zone and never shows 10', () => {
    for (const seed of SEEDS) {
      const all = collect(new DepositMap(seed), 6, 'forward');
      expect(all.length).toBeGreaterThan(200);
      for (const d of all) {
        expect(d.value).not.toBe(10);
        expect(d.value).toBeGreaterThanOrEqual(1);
        expect(inClearZone(d.x, d.y)).toBe(false);
      }
      // Tile-level check: no two deposits within 1 tile of each other.
      const occupied = new Map<string, number>();
      all.forEach((d, i) => {
        for (let y = d.y - 1; y <= d.y + 1; y++) {
          for (let x = d.x - 1; x <= d.x + 1; x++) occupied.set(`${x},${y}`, i);
        }
      });
      all.forEach((d, i) => {
        for (let y = d.y - 2; y <= d.y + 2; y++) {
          for (let x = d.x - 2; x <= d.x + 2; x++) {
            const owner = occupied.get(`${x},${y}`);
            if (owner !== undefined) expect(owner).toBe(i);
          }
        }
      });
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          if (a && b) expect(depositsConflict(a, b)).toBe(false);
        }
      }
    }
  });

  it('includes guaranteed deposits in their chunk, first', () => {
    const map = new DepositMap(42);
    for (const g of map.guaranteed.slice(0, 20)) {
      const chunk = map.getChunk(Math.floor(g.x / CHUNK_SIZE), Math.floor(g.y / CHUNK_SIZE));
      expect(chunk).toContainEqual(g);
    }
  });

  it('respects vmax(d) for random deposits', () => {
    const map = new DepositMap(7);
    const guaranteed = new Set(map.guaranteed);
    for (const d of collect(map, 6, 'forward')) {
      if (guaranteed.has(d)) continue;
      expect(d.value).toBeLessThanOrEqual(vmaxAt(depositDistance(d.x, d.y)));
    }
  });

  it('finds deposits by tile and by value', () => {
    const map = new DepositMap(42);
    const one = map.findNearest(1);
    expect(one?.value).toBe(1);
    if (!one) return;
    expect(map.depositAt(one.x + 1, one.y - 1)).toEqual(one);
    expect(map.depositAt(0, 0)).toBeNull();
    expect(map.findNearest(10)).toBeNull();
  });
});

describe('value draw', () => {
  it('vmax grows with distance', () => {
    expect(vmaxAt(0)).toBe(2);
    expect(vmaxAt(21.9)).toBe(2);
    expect(vmaxAt(22)).toBe(3);
    expect(vmaxAt(220)).toBe(12);
  });

  it('never draws 10 and follows v^-1.15 weights', () => {
    const rng = mulberry32(99);
    const counts = new Map<number, number>();
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const v = drawValue(rng, 20);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect(counts.has(10)).toBe(false);
    let total = 0;
    for (let v = 1; v <= 20; v++) if (v !== 10) total += v ** -1.15;
    for (const v of [1, 2, 5, 11, 20]) {
      const expected = (v ** -1.15 / total) * N;
      expect(Math.abs((counts.get(v) ?? 0) - expected) / expected).toBeLessThan(0.05);
    }
  });
});

describe('extractability', () => {
  it('follows maxExtraction and excludes 10', () => {
    expect(isExtractable(1, 1)).toBe(true);
    expect(isExtractable(2, 1)).toBe(false);
    expect(isExtractable(10, 15)).toBe(false);
    expect(isExtractable(11, 15)).toBe(true);
  });
});
