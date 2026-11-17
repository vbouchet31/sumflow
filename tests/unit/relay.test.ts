import { describe, expect, it } from 'vitest';
import { RELAY_MAX } from '../../src/config/balance';
import { E } from '../../src/core/grid';
import { applyBuildingPlan, planOperator } from '../../src/build/placement';
import { dirMask } from '../../src/sim/entities';
import { applyReward } from '../../src/sim/progression';
import { runTicks } from '../../src/sim/tick';
import { makeWorld } from './helpers/scenario';

describe('delivery relays', () => {
  it('deliver to the hub from afar', () => {
    const world = makeWorld();
    world.addBuilding('relay', 100, 100, 0);
    const belt = world.setBelt(99, 100, dirMask(E));
    belt.item = { value: 1, progress: 0, from: null, stamp: -1 };
    runTicks(world, 90);
    expect(world.state.totalDelivered).toBe(1);
    expect(world.state.levelRequirement?.delivered).toBe(1);
  });

  it('are limited in number', () => {
    const world = makeWorld();
    applyReward(world.state, { kind: 'building', building: 'relay' });
    for (let i = 0; i < RELAY_MAX; i++) {
      expect(
        applyBuildingPlan(world, planOperator(world, 'relay', 50 + 5 * i, 50, 0)),
      ).not.toBeNull();
    }
    expect(planOperator(world, 'relay', 80, 50, 0).ok).toBe(false);
  });
});
