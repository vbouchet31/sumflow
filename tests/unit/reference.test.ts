import { describe, expect, it } from 'vitest';
import { E, S } from '../../src/core/grid';
import { PerfMeter } from '../../src/debug/perfMeter';
import { buildReferenceScenario, countItems, REFERENCE } from '../../src/debug/reference';
import { dirMask } from '../../src/sim/entities';
import { layoutString } from '../../src/sim/layout';
import { runTicks } from '../../src/sim/tick';
import { beltLine, makeWorld } from './helpers/scenario';

describe('reference scenario (PLAN §10.4)', () => {
  it('has 20 000 belts and 1 000 buildings, and simulates deterministically', () => {
    const a = makeWorld();
    const b = makeWorld();
    buildReferenceScenario(a);
    buildReferenceScenario(b);
    const modules = REFERENCE.columns * REFERENCE.rows;
    expect(a.state.belts.size).toBe(modules * REFERENCE.beltsPerModule);
    expect(a.state.belts.size).toBe(20_000);
    expect(a.state.buildings.size - 1).toBe(1_000);
    expect(layoutString(a)).toBe(layoutString(b));
    runTicks(a, 900);
    runTicks(b, 900);
    expect(countItems(a)).toBeGreaterThan(5_000);
    const items = (w: typeof a): string =>
      [...w.state.belts.values()].map((t) => `${t.item?.value}@${t.item?.progress}`).join();
    expect(items(a)).toBe(items(b));
  });
});

describe('cached output targets', () => {
  it('a belt that led nowhere flows again once it is extended', () => {
    const world = makeWorld();
    world.addBuilding('extractor', 40, 0, 0, { extractValue: 1 });
    beltLine(world, 43, 1, E, 3);
    runTicks(world, 600);
    // Blocked at the end of the line: the "nothing here" target is cached.
    expect(world.beltAt(45, 1)?.item?.progress).toBe(1);
    expect(world.beltAt(46, 1)).toBeNull();
    beltLine(world, 46, 1, E, 3);
    runTicks(world, 120);
    expect(world.beltAt(47, 1)?.item ?? world.beltAt(48, 1)?.item).toBeTruthy();
  });

  it('an extractor uses a new output as soon as a belt touches it', () => {
    const world = makeWorld();
    const ex = world.addBuilding('extractor', 40, 0, 0, { extractValue: 1 });
    runTicks(world, 120); // nothing connected: every face resolves to "none"
    expect(countItems(world)).toBe(0);
    world.setBelt(41, 3, dirMask(S));
    runTicks(world, 120);
    expect(world.beltAt(41, 3)?.item?.value).toBe(1);
    world.removeBuilding(ex.id);
    world.removeBelt(41, 3);
    expect(world.outputGroups.size).toBe(0);
  });
});

describe('PerfMeter', () => {
  it('publishes averages every half second', () => {
    const meter = new PerfMeter();
    let published = 0;
    // 61 frames, 10 ms apart, 2 ticks of 1.5 ms each and 3 ms of drawing per frame.
    for (let i = 0; i <= 60; i++) if (meter.frame(i * 10, 3, 2, 3)) published++;
    expect(published).toBe(1);
    expect(meter.stats.fps).toBeCloseTo(100, 5);
    expect(meter.stats.frameMs).toBeCloseTo(10, 5);
    expect(meter.stats.worstFrameMs).toBeCloseTo(10, 5);
    expect(meter.stats.simMsPerTick).toBeCloseTo(1.5, 5);
    expect(meter.stats.renderMs).toBeCloseTo(3, 5);
    expect(meter.stats.ticksPerSecond).toBeCloseTo(200, 5);
  });
});
