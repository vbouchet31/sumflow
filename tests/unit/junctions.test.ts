import { describe, expect, it } from 'vitest';
import {
  applyBeltPlan,
  computeLPath,
  planBeltPath,
  planManualBridge,
} from '../../src/build/beltPath';
import { demolishAt } from '../../src/build/placement';
import { type Dir, E, N, S, W } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { priorityTiles, togglePriorityAt } from '../../src/sim/priority';
import { runTicks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { beltLine, makeWorld, runScenario } from './helpers/scenario';

/** Count and remove items reaching the given sink tiles, tick by tick. */
function runWithSinks(
  world: World,
  sinks: { x: number; y: number }[],
  ticks: number,
): { counts: number[]; values: number[][] } {
  const counts = sinks.map(() => 0);
  const values: number[][] = sinks.map(() => []);
  for (let i = 0; i < ticks; i++) {
    runTicks(world, 1);
    sinks.forEach((s, j) => {
      const lane = world.laneAt(s.x, s.y, 0) ?? world.laneAt(s.x, s.y, 1);
      if (lane?.belt.item) {
        counts[j] = (counts[j] ?? 0) + 1;
        values[j]?.push(lane.belt.item.value);
        lane.belt.item = null;
      }
    });
  }
  return { counts, values };
}

/** Saturated source: a level-12 extractor of `value` whose west face (x, y) feeds a belt. */
function source(world: World, x: number, y: number, value: number): void {
  world.state.upgrades.extractor = 12;
  world.addBuilding('extractor', x, y - 1, 0, { extractValue: value });
}

describe('merge', () => {
  it('two full belts into one share it 50/50 ± 2 %', () => {
    const { delivered } = runScenario(
      (w) => {
        source(w, 17, 0, 1);
        beltLine(w, 16, 0, W, 4); // 16..13 → (12, 0)
        w.state.upgrades.extractor = 12;
        w.addBuilding('extractor', 11, -8, 0, { extractValue: 2 }); // south face at (12, -6)
        beltLine(w, 12, -5, S, 5); // (12,-5)..(12,-1) → (12, 0)
        beltLine(w, 12, 0, W, 10); // merge tile and main line into hub tile (2, 0)
      },
      120,
      30,
    );
    const ones = delivered.get(1) ?? 0;
    const twos = delivered.get(2) ?? 0;
    expect(ones + twos).toBeGreaterThanOrEqual(119);
    expect(Math.abs(ones / (ones + twos) - 0.5)).toBeLessThanOrEqual(0.02);
  });
});

describe('split', () => {
  it('one full belt split three ways gives 1/3 each ± 2 %', () => {
    const world = makeWorld();
    source(world, 40, 0, 5);
    beltLine(world, 39, 0, W, 4); // 39..36 → splitter (35, 0)
    world.setBelt(35, 0, dirMask(N) | dirMask(W) | dirMask(S));
    world.setBelt(35, -1, dirMask(N));
    world.setBelt(34, 0, dirMask(W));
    world.setBelt(35, 1, dirMask(S));
    const { counts } = runWithSinks(
      world,
      [
        { x: 35, y: -1 },
        { x: 34, y: 0 },
        { x: 35, y: 1 },
      ],
      60 * 300,
    );
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(290);
    for (const c of counts) expect(Math.abs(c / total - 1 / 3)).toBeLessThanOrEqual(0.02);
  });
});

describe('priorities', () => {
  function splitter(world: World): void {
    world.state.unlockedFeatures.push('priorities');
    source(world, 60, 0, 3);
    beltLine(world, 59, 0, W, 3); // 59..57 → splitter (56, 0)
    world.setBelt(56, 0, dirMask(N) | dirMask(S));
    world.setBelt(56, -1, dirMask(N));
    world.setBelt(56, 1, dirMask(S));
  }

  it('sends everything to the prioritised output while it has room', () => {
    const world = makeWorld();
    splitter(world);
    expect(togglePriorityAt(world, 56, 1)).toBe('set');
    expect(priorityTiles(world)).toEqual([{ x: 56, y: 1 }]);
    const { counts } = runWithSinks(
      world,
      [
        { x: 56, y: 1 },
        { x: 56, y: -1 },
      ],
      60 * 60,
    );
    expect(counts[0]).toBeGreaterThan(55);
    expect(counts[1]).toBe(0);
  });

  it('falls back to the others once the prioritised output is full', () => {
    const world = makeWorld();
    splitter(world);
    togglePriorityAt(world, 56, 1);
    // The prioritised branch is a dead end: it fills, then the north branch gets the flow.
    const { counts } = runWithSinks(world, [{ x: 56, y: -1 }], 60 * 60);
    expect(counts[0]).toBeGreaterThan(50);
  });

  it('one priority per source; clicking again clears it; locked feature does nothing', () => {
    const world = makeWorld();
    splitter(world);
    togglePriorityAt(world, 56, 1);
    togglePriorityAt(world, 56, -1);
    expect(world.beltAt(56, 0)?.priority).toBe(N);
    expect(togglePriorityAt(world, 56, -1)).toBe('cleared');
    expect(world.beltAt(56, 0)?.priority).toBeNull();
    const locked = makeWorld();
    locked.setBelt(0, 10, dirMask(E) | dirMask(S));
    locked.setBelt(1, 10, dirMask(E));
    expect(togglePriorityAt(locked, 1, 10)).toBe('none');
  });

  it('works on building outputs (extractor faces)', () => {
    const world = makeWorld();
    world.state.unlockedFeatures.push('priorities');
    world.addBuilding('extractor', 80, -1, 0, { extractValue: 7 }); // x 80..82
    world.setBelt(79, 0, dirMask(W));
    world.setBelt(83, 0, dirMask(E));
    expect(togglePriorityAt(world, 83, 0)).toBe('set');
    const { counts } = runWithSinks(
      world,
      [
        { x: 83, y: 0 },
        { x: 79, y: 0 },
      ],
      60 * 30,
    );
    expect(counts[0]).toBeGreaterThan(25);
    expect(counts[1]).toBe(0);
  });
});

describe('bridges', () => {
  it('two crossing flows on a bridge never mix', () => {
    const world = makeWorld();
    source(world, 104, 0, 1); // horizontal flow of 1, west from x = 103
    beltLine(world, 103, 0, W, 3); // 103..101 → bridge (100, 0) → 99
    world.state.upgrades.extractor = 12;
    world.addBuilding('extractor', 99, -6, 0, { extractValue: 2 }); // south face (100, -4)
    beltLine(world, 100, -3, S, 3); // (100,-3)..(100,-1) → bridge → (100, 1)
    world.setBridge(100, 0, W, S);
    world.setBelt(99, 0, dirMask(W));
    world.setBelt(100, 1, dirMask(S));
    const { counts, values } = runWithSinks(
      world,
      [
        { x: 99, y: 0 },
        { x: 100, y: 1 },
      ],
      60 * 60,
    );
    expect(counts[0]).toBeGreaterThan(50);
    expect(counts[1]).toBeGreaterThan(50);
    expect(values[0]?.every((v) => v === 1)).toBe(true);
    expect(values[1]?.every((v) => v === 2)).toBe(true);
  });

  it('drawing across a straight perpendicular belt makes a bridge once unlocked', () => {
    const world = makeWorld();
    beltLine(world, 120, -3, S, 6); // vertical line through (120, 0)
    const crossing = (): string | undefined =>
      planBeltPath(world, computeLPath(117, 0, 123, 0, false)).find((t) => t.x === 120)?.status;
    expect(crossing()).toBe('replace');
    world.state.unlockedBuildings.push('bridge');
    expect(crossing()).toBe('bridge');
    applyBeltPlan(world, planBeltPath(world, computeLPath(117, 0, 123, 0, false)));
    const br = world.bridgeAt(120, 0);
    expect(br?.h?.outputs).toBe(dirMask(E));
    expect(br?.v?.outputs).toBe(dirMask(S));
    expect(world.beltAt(120, 0)).toBeNull();
    // Demolishing a bridge removes both lanes.
    expect(demolishAt(world, 120, 0)).toBe(true);
    expect(world.bridgeAt(120, 0)).toBeNull();
  });

  it('does not bridge a junction or a belt fed from the side', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('bridge');
    world.setBelt(140, 0, dirMask(S) | dirMask(E)); // junction
    const plan = planBeltPath(world, computeLPath(137, 0, 143, 0, false));
    expect(plan.find((t) => t.x === 140)?.status).toBe('replace');
  });

  it('manual bridge takes lane directions from feeding belts, then the rotation', () => {
    const world = makeWorld();
    world.setBelt(149, 0, dirMask(E)); // feeds (150, 0) eastward
    expect(planManualBridge(world, 150, 0, N as Dir)).toEqual({ h: E, v: N });
    expect(planManualBridge(world, 160, 0, E as Dir)).toEqual({ h: E, v: S });
    expect(planManualBridge(world, 0, 0, E as Dir)).toBeNull(); // hub
  });
});
