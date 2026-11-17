import { describe, expect, it } from 'vitest';
import { isPrime, matchesRule } from '../../src/sim/sorter';
import { runTicks } from '../../src/sim/tick';
import { makeWorld } from './helpers/scenario';
import { E } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';

describe('sorter rules', () => {
  it('detects primes', () => {
    expect([1, 2, 3, 4, 5, 9, 11, 25, 97].map(isPrime)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(isPrime(2_147_483_647)).toBe(true);
  });

  it('applies every rule', () => {
    expect(matchesRule({ kind: 'even', n: 0 }, 4)).toBe(true);
    expect(matchesRule({ kind: 'odd', n: 0 }, 4)).toBe(false);
    expect(matchesRule({ kind: 'eq', n: 7 }, 7)).toBe(true);
    expect(matchesRule({ kind: 'lt', n: 7 }, 7)).toBe(false);
    expect(matchesRule({ kind: 'gt', n: 7 }, 8)).toBe(true);
    expect(matchesRule({ kind: 'mult', n: 3 }, 12)).toBe(true);
    expect(matchesRule({ kind: 'mult', n: 0 }, 12)).toBe(false);
  });
});

describe('sorter and incinerator simulation', () => {
  it('sends matching items to ✓ and the others to ✗', () => {
    const world = makeWorld();
    const s = world.addBuilding('sorter', 40, 0, 0);
    world.setSortRule(s, { kind: 'odd', n: 0 });
    for (let i = 0; i < 4; i++) s.inA?.push(i + 1);
    runTicks(world, 60 * 5); // one item per belt step: 1 per second at belt level 1
    expect(s.outQ).toEqual([1, 3]);
    expect(s.outR).toEqual([2, 4]);
  });

  it('the incinerator swallows what a belt brings', () => {
    const world = makeWorld();
    const trash = world.addBuilding('trash', 51, 0, 0);
    const belt = world.setBelt(50, 0, dirMask(E));
    belt.item = { value: 5, progress: 0, from: null, stamp: -1 };
    runTicks(world, 60);
    expect(belt.item).toBeNull();
    expect(trash.trashCount).toBe(1);
  });
});
