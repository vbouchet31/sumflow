import { describe, expect, it } from 'vitest';
import { E } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { runTicks } from '../../src/sim/tick';
import { beltLine, makeWorld } from './helpers/scenario';

describe('portals', () => {
  it('pair an entrance with the next exit, and open a new channel per entrance', () => {
    const world = makeWorld();
    const in1 = world.addBuilding('warpIn', 40, 0, 0);
    const out1 = world.addBuilding('warpOut', 80, 0, 0);
    const out1b = world.addBuilding('warpOut', 80, 10, 0);
    const in2 = world.addBuilding('warpIn', 40, 10, 0);
    const out2 = world.addBuilding('warpOut', 90, 10, 0);
    expect([in1.channel, out1.channel, out1b.channel]).toEqual([1, 1, 1]);
    expect([in2.channel, out2.channel]).toEqual([2, 2]);
  });

  it('teleport items from a belt to the belt after the exit', () => {
    const world = makeWorld();
    world.addBuilding('warpIn', 41, 0, 0);
    world.addBuilding('warpOut', 100, 0, 0);
    const feed = world.setBelt(40, 0, dirMask(E));
    beltLine(world, 101, 0, E, 5);
    feed.item = { value: 7, progress: 0, from: null, stamp: -1 };
    runTicks(world, 120);
    const after = [...world.state.belts.values()].filter((b) => b.x > 100 && b.item);
    expect(after.map((b) => b.item?.value)).toEqual([7]);
  });

  it('survive undo of a demolition with their channel', () => {
    const world = makeWorld();
    world.addBuilding('warpIn', 41, 0, 0);
    world.beginChange();
    const out = world.addBuilding('warpOut', 100, 0, 0);
    world.endChange();
    world.beginChange();
    world.removeBuilding(out.id);
    const change = world.endChange();
    if (!change) throw new Error('no change');
    world.applyChange(change, 'before');
    expect(world.buildingAt(100, 0)?.channel).toBe(1);
  });
});
