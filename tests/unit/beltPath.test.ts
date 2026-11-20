import { describe, expect, it } from 'vitest';
import {
  applyBeltPlan,
  computeLPath,
  extendTrail,
  type Cell,
  planBeltPath,
  planSingleBelt,
  trailToPath,
} from '../../src/build/beltPath';
import { demolishAt, planExtractor, applyBuildingPlan } from '../../src/build/placement';
import { ToolController } from '../../src/build/tools';
import { E, N, S, W } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };

describe('computeLPath', () => {
  it('goes along the larger gap first, then turns', () => {
    const p = computeLPath(0, 0, 3, 1, false);
    expect(p.map((t) => [t.x, t.y, t.dir])).toEqual([
      [0, 0, E],
      [1, 0, E],
      [2, 0, E],
      [3, 0, S],
      [3, 1, S],
    ]);
  });

  it('Ctrl swaps the elbow', () => {
    const p = computeLPath(0, 0, 3, 1, true);
    expect(p.map((t) => [t.x, t.y, t.dir])).toEqual([
      [0, 0, S],
      [0, 1, E],
      [1, 1, E],
      [2, 1, E],
      [3, 1, E],
    ]);
  });

  it('handles straight lines in every direction and keeps the last segment direction', () => {
    expect(computeLPath(0, 0, -2, 0, false).map((t) => t.dir)).toEqual([W, W, W]);
    expect(computeLPath(0, 0, 0, -2, false).map((t) => t.dir)).toEqual([N, N, N]);
    expect(computeLPath(5, 5, 5, 5, false)).toEqual([]);
  });
});

describe('freehand trail', () => {
  const cells = (t: Cell[]): number[][] => t.map((c) => [c.x, c.y]);

  it('fills the tiles skipped by a fast move, larger gap first', () => {
    const trail: Cell[] = [{ x: 0, y: 0 }];
    extendTrail(trail, 3, 1);
    expect(cells(trail)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
  });

  it('keeps its heading on an exact diagonal', () => {
    const trail: Cell[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    extendTrail(trail, 1, 2);
    expect(cells(trail)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('going back erases, and jitter on a border leaves nothing behind', () => {
    const trail: Cell[] = [{ x: 0, y: 0 }];
    extendTrail(trail, 3, 0);
    extendTrail(trail, 1, 0);
    expect(cells(trail)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    extendTrail(trail, 1, 1);
    extendTrail(trail, 2, 1);
    extendTrail(trail, 1, 1);
    extendTrail(trail, 2, 1);
    expect(cells(trail)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ]);
  });

  it('a loop back onto the trail cuts it there', () => {
    const trail: Cell[] = [{ x: 0, y: 0 }];
    for (const [x, y] of [
      [2, 0],
      [2, 2],
      [1, 2],
      [1, 0],
    ] as const)
      extendTrail(trail, x, y);
    expect(cells(trail)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('each tile of the path outputs toward the next one', () => {
    const path = trailToPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(path.map((t) => t.dir)).toEqual([E, S, W, W]);
    expect(trailToPath([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe('belt placement', () => {
  it('skips tiles under buildings and the hub', () => {
    const world = makeWorld();
    const plan = planBeltPath(world, computeLPath(-5, 0, 5, 0, false));
    const blocked = plan.filter((t) => t.status === 'blocked').map((t) => t.x);
    expect(blocked).toEqual([-3, -2, -1, 0, 1, 2]);
    applyBeltPlan(world, plan);
    expect(world.state.belts.size).toBe(5);
  });

  it('starting on an existing belt adds an output (split)', () => {
    const world = makeWorld();
    world.setBelt(20, 0, dirMask(E));
    world.setBelt(21, 0, dirMask(E));
    const plan = planBeltPath(world, computeLPath(20, 0, 20, 3, false));
    expect(plan[0]?.status).toBe('addOutput');
    applyBeltPlan(world, plan);
    expect(world.beltAt(20, 0)?.outputs).toBe(dirMask(E) | dirMask(S));
  });

  it('starting on the dead end of a belt turns it instead of splitting', () => {
    const world = makeWorld();
    world.setBelt(19, 0, dirMask(E));
    world.setBelt(20, 0, dirMask(E));
    const plan = planBeltPath(world, computeLPath(20, 0, 20, 3, false));
    expect(plan[0]?.status).toBe('replace');
    applyBeltPlan(world, plan);
    expect(world.beltAt(20, 0)?.outputs).toBe(dirMask(S));
    expect(world.beltAt(19, 0)?.outputs).toBe(dirMask(E));
  });

  it('crossing an existing belt replaces it (no bridge before M6)', () => {
    const world = makeWorld();
    world.setBelt(30, 2, dirMask(S));
    const plan = planBeltPath(world, computeLPath(28, 2, 32, 2, false));
    expect(plan.find((t) => t.x === 30)?.status).toBe('replace');
    applyBeltPlan(world, plan);
    expect(world.beltAt(30, 2)?.outputs).toBe(dirMask(E));
  });

  it('a single click uses the rotation and replaces', () => {
    const world = makeWorld();
    expect(planSingleBelt(world, 40, 0, N)[0]?.status).toBe('new');
    world.setBelt(40, 0, dirMask(E));
    expect(planSingleBelt(world, 40, 0, N)[0]?.status).toBe('replace');
    expect(planSingleBelt(world, 0, 0, N)[0]?.status).toBe('blocked');
  });
});

describe('extractor placement', () => {
  it('snaps to an extractable deposit and refuses locked ones', () => {
    const world = makeWorld(42);
    const one = world.deposits.findNearest(1);
    const two = world.deposits.findNearest(2);
    if (!one || !two) throw new Error('deposits missing');
    const plan = planExtractor(world, one.x + 1, one.y);
    expect(plan).toMatchObject({ ok: true, x: one.x - 1, y: one.y - 1, value: 1 });
    expect(planExtractor(world, two.x, two.y).ok).toBe(false);
    expect(applyBuildingPlan(world, plan)?.extractValue).toBe(1);
    // Occupied now.
    expect(planExtractor(world, one.x, one.y).ok).toBe(false);
    expect(demolishAt(world, one.x, one.y)).toBe(true);
    expect(demolishAt(world, 0, 0)).toBe(false); // hub is indestructible
  });
});

describe('ToolController', () => {
  it('drags an L-shaped belt path in one action', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerMove(11, 10, NO_MODS);
    tools.pointerMove(14, 12, NO_MODS);
    expect(tools.ghost().belts).toHaveLength(7);
    tools.pointerUp(14, 12, NO_MODS);
    expect(world.state.belts.size).toBe(7);
  });

  it('in freehand mode, follows the pointer through several turns', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.beltMode = 'free';
    tools.setTool('belt');
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerMove(12, 10, NO_MODS);
    tools.pointerMove(12, 12, NO_MODS);
    tools.pointerMove(14, 12, NO_MODS);
    expect(tools.ghost().belts).toHaveLength(7);
    tools.pointerUp(14, 12, NO_MODS);
    expect(world.state.belts.size).toBe(7);
    expect(world.beltAt(12, 10)?.outputs).toBe(dirMask(S));
    expect(world.beltAt(12, 12)?.outputs).toBe(dirMask(E));
    expect(world.beltAt(14, 12)?.outputs).toBe(dirMask(E));
  });

  it('in freehand mode, a click still places one belt', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.beltMode = 'free';
    tools.setTool('belt');
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerUp(10, 10, NO_MODS);
    expect(world.beltAt(10, 10)?.outputs).toBe(dirMask(E));
  });

  it('a click places one belt facing the rotation', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    tools.rotate(1); // East → South
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerUp(10, 10, NO_MODS);
    expect(world.beltAt(10, 10)?.outputs).toBe(dirMask(S));
  });
});
