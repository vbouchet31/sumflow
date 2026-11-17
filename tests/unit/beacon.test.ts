import { describe, expect, it } from 'vitest';
import { BEACON, TICK_RATE } from '../../src/config/balance';
import { E } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { runTicks } from '../../src/sim/tick';
import { makeWorld } from './helpers/scenario';

/** Results made by an adder kept fed for `seconds`, with or without a glowing beacon. */
function results(withBeacon: boolean, seconds: number): number {
  const world = makeWorld();
  const add = world.addBuilding('adder', 40, 0, 0);
  const beacon = withBeacon ? world.addBuilding('beacon', 44, 0, 0) : null;
  let made = 0;
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    while ((add.inA?.length ?? 4) < 4) add.inA?.push(1);
    while ((add.inB?.length ?? 4) < 4) add.inB?.push(1);
    if (beacon) beacon.fuel = BEACON.maxSeconds;
    made += add.out?.length ?? 0;
    add.out?.splice(0);
    runTicks(world, 1);
  }
  return made;
}

describe('beacons', () => {
  it('speed up an operator in range by half', () => {
    const plain = results(false, 240);
    const boosted = results(true, 240);
    expect(boosted / plain).toBeCloseTo(BEACON.factor, 1);
  });

  it('burn the items they receive and refuse once full', () => {
    const world = makeWorld();
    const beacon = world.addBuilding('beacon', 41, 0, 0);
    const belt = world.setBelt(40, 0, dirMask(E));
    for (let i = 0; i < 20; i++) {
      if (!belt.item) belt.item = { value: 3, progress: 0, from: null, stamp: -1 };
      runTicks(world, 30);
    }
    expect(beacon.fuel).toBeGreaterThan(BEACON.maxSeconds - BEACON.secondsPerItem - 0.5);
    expect(beacon.fuel).toBeLessThanOrEqual(BEACON.maxSeconds);
    expect(belt.item).not.toBeNull(); // waiting: the beacon is full
  });
});
