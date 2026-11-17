import { describe, expect, it } from 'vitest';
import { METEORS, TICK_RATE } from '../../src/config/balance';
import { applyBuildingPlan, planExtractor } from '../../src/build/placement';
import { drawMeteor, stepMeteors } from '../../src/sim/meteors';
import { setLevel } from '../../src/sim/progression';
import { runTicks } from '../../src/sim/tick';
import { makeWorld } from './helpers/scenario';

function advance(world: ReturnType<typeof makeWorld>, seconds: number): void {
  runTicks(world, Math.round(seconds * TICK_RATE));
}

describe('meteorites', () => {
  it('fall on schedule, seeded, beyond the extraction cap', () => {
    const world = makeWorld(5);
    setLevel(world.state, METEORS.fromLevel);
    advance(world, METEORS.firstDelay + 1);
    const m = world.state.meteors.active[0];
    expect(m).toBeDefined();
    expect(m?.value).toBeGreaterThan(world.state.maxExtraction);
    const again = makeWorld(5);
    setLevel(again.state, METEORS.fromLevel);
    expect(drawMeteor(again, 1)?.value).toBe(m?.value);
  });

  it('can be mined, then fade and stop the extractor', () => {
    const world = makeWorld(5);
    setLevel(world.state, METEORS.fromLevel);
    advance(world, METEORS.firstDelay + 1);
    const m = world.state.meteors.active[0];
    if (!m) throw new Error('no meteorite');
    const plan = planExtractor(world, m.x, m.y);
    expect(plan.ok).toBe(true);
    const ex = applyBuildingPlan(world, plan);
    expect(ex?.extractValue).toBe(m.value);
    advance(world, 1);
    expect(ex?.extractAcc).toBeGreaterThan(0);
    advance(world, METEORS.lifetime);
    expect(world.state.meteors.active).toHaveLength(0);
    const acc = ex?.extractAcc;
    advance(world, 2);
    expect(ex?.extractAcc).toBe(acc);
  });

  it('wait for the level', () => {
    const world = makeWorld(5);
    for (let i = 0; i < 600 * TICK_RATE; i += 60) {
      world.state.tick += 60;
      stepMeteors(world);
    }
    expect(world.state.meteors.count).toBe(0);
  });
});
