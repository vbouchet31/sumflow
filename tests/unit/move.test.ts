import { describe, expect, it } from 'vitest';
import { applyMove, isMovable, planMove, rotatedOrigin } from '../../src/build/move';
import { ToolController } from '../../src/build/tools';
import { type Dir, E, key, N, S, W } from '../../src/core/grid';
import { resolveTarget } from '../../src/sim/belts';
import { dirMask } from '../../src/sim/entities';
import { layoutString } from '../../src/sim/layout';
import { runTicks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { TICK_RATE } from '../../src/config/balance';
import { beltLine, makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };
const TOUCH = { ...NO_MODS, touch: true };

function unlock(world: World): void {
  world.state.unlockedBuildings.push('adder', 'multiplier', 'subtractor', 'storage');
}

/** What a belt (or a port) at `(x, y)` pushing toward `d` reaches. */
function reaches(world: World, x: number, y: number, d: Dir): string {
  const t = resolveTarget(world, x, y, d);
  return t.kind === 'port' ? `port ${t.port}` : t.kind;
}

function outputs(world: World, x: number, y: number): number | null {
  return world.beltAt(x, y)?.outputs ?? null;
}

/**
 * Adder at (20, 20): A fed from the West along row 20, B fed from the North along column
 * 21, O starts a line going South from (20, 22).
 */
function adderFactory(): World {
  const world = makeWorld();
  unlock(world);
  world.addBuilding('adder', 20, 20, 0);
  beltLine(world, 10, 20, E, 10); // ... → (19, 20) → A
  beltLine(world, 21, 10, S, 10); // ... → (21, 19) → B
  beltLine(world, 20, 22, S, 9); // O → (20, 22) → ... (20, 30)
  return world;
}

describe('moving a building with its belts', () => {
  it('stretches the lines feeding it and shortens the line it feeds', () => {
    const world = adderFactory();
    const id = world.buildingAt(20, 20)?.id ?? -1;
    const plan = planMove(world, id, 20, 23, 0);
    expect(plan?.building.ok).toBe(true);
    expect(plan?.broken).toEqual([]);
    expect(plan && applyMove(world, plan)).toBe(true);

    expect(world.buildingAt(20, 23)?.id).toBe(id);
    // A: the last belt turns South, then East into the port.
    expect(outputs(world, 19, 20)).toBe(dirMask(S));
    expect(outputs(world, 19, 22)).toBe(dirMask(S));
    expect(outputs(world, 19, 23)).toBe(dirMask(E));
    expect(reaches(world, 19, 23, E)).toBe('port A');
    // B: the line goes on through the old place.
    expect(outputs(world, 21, 22)).toBe(dirMask(S));
    expect(reaches(world, 21, 22, S)).toBe('port B');
    // O: the line now starts right under the new port; what was above it is gone.
    expect(world.beltAt(20, 22)).toBeNull();
    expect(reaches(world, 20, 24, S)).toBe('belt');
    expect(outputs(world, 20, 25)).toBe(dirMask(S));
  });

  it('items still reach the moved building', () => {
    const world = adderFactory();
    const adder = world.buildingAt(20, 20);
    if (!adder) throw new Error('no adder');
    const plan = planMove(world, adder.id, 24, 26, 0);
    if (!plan) throw new Error('no plan');
    applyMove(world, plan);
    const start = world.beltAt(10, 20);
    if (!start) throw new Error('no belt');
    start.item = { value: 3, progress: 0, from: null, stamp: -1 };
    runTicks(world, 60 * TICK_RATE);
    expect(adder.inA).toEqual([3]);
  });

  it('is one undoable step that brings the building back with its contents', () => {
    const world = adderFactory();
    const tools = new ToolController(world);
    const before = layoutString(world);
    const adder = world.buildingAt(20, 20);
    if (!adder) throw new Error('no adder');
    adder.inA?.push(7);
    tools.pointerDown(20, 20, NO_MODS);
    tools.pointerMove(22, 26, NO_MODS);
    expect(tools.isMoving).toBe(true);
    expect(tools.ghost().buildings[0]).toMatchObject({ x: 22, y: 26, ok: true });
    tools.pointerUp(22, 26, NO_MODS);
    expect(world.buildingAt(22, 26)).toBe(adder);
    expect(adder.inA).toEqual([7]);
    // The moved building stays selected.
    expect(tools.selection).toEqual({ kind: 'building', id: adder.id });
    expect(tools.history.undoSize).toBe(1);

    tools.undo();
    expect(layoutString(world)).toBe(before);
    expect(world.buildingAt(20, 20)).toBe(adder);
    expect(adder.inA).toEqual([7]);
    tools.redo();
    expect(world.buildingAt(22, 26)).toBe(adder);
  });

  it('leaves a line that cannot follow where it is, and moves anyway', () => {
    const world = adderFactory();
    // A wall of belts across the path of the A line (and of nothing else).
    beltLine(world, 15, 21, N, 1);
    beltLine(world, 19, 26, W, 1);
    world.addBuilding('storage', 17, 22, 0); // covers (17..19, 22..24)
    const id = world.buildingAt(20, 20)?.id ?? -1;
    const plan = planMove(world, id, 20, 24, 0);
    expect(plan?.building.ok).toBe(true);
    expect(plan?.broken).toEqual([{ x: 19, y: 20, dir: E }]);
    expect(plan && applyMove(world, plan)).toBe(true);
    expect(outputs(world, 19, 20)).toBe(dirMask(E)); // untouched, now pointing at nothing
    expect(reaches(world, 21, 23, S)).toBe('port B');
  });

  it('cannot go onto another building; the hub and extractors do not move', () => {
    const world = adderFactory();
    world.addBuilding('multiplier', 30, 20, 0);
    const id = world.buildingAt(20, 20)?.id ?? -1;
    const plan = planMove(world, id, 29, 19, 0);
    expect(plan?.building.ok).toBe(false);
    expect(plan && applyMove(world, plan)).toBe(false);
    expect(world.buildingAt(20, 20)?.id).toBe(id);

    const hub = world.buildingAt(0, 0);
    if (!hub) throw new Error('no hub');
    expect(isMovable(hub)).toBe(false);
    expect(planMove(world, hub.id, 40, 40, 0)).toBeNull();
  });

  it('moving onto its own lines eats them and keeps the rest connected', () => {
    const world = adderFactory();
    const id = world.buildingAt(20, 20)?.id ?? -1;
    // Two tiles West: onto the end of the A line.
    const plan = planMove(world, id, 18, 20, 0);
    expect(plan && applyMove(world, plan)).toBe(true);
    expect(reaches(world, 17, 20, E)).toBe('port A');
    expect(reaches(world, 19, 19, S)).toBe('port B');
    // The O line takes the closest output face: one belt from (19, 22) into its old start.
    expect(reaches(world, 19, 21, S)).toBe('belt');
    expect(outputs(world, 19, 22)).toBe(dirMask(E));
    // The O line was pulled along: it still ends at (20, 30).
    expect(outputs(world, 20, 30)).toBe(dirMask(S));
  });

  it('the prioritised output stays on the same port', () => {
    const world = makeWorld();
    unlock(world);
    const b = world.addBuilding('adder', 20, 20, 0);
    world.setBelt(20, 22, dirMask(S));
    world.setBelt(22, 21, dirMask(E));
    const prio = key(21, 21) * 4 + E;
    world.setBuildingPriority(b, prio);
    const plan = planMove(world, b.id, 25, 25, 0);
    if (!plan) throw new Error('no plan');
    applyMove(world, plan);
    expect(b.priority).toBe(key(26, 26) * 4 + E);
  });
});

describe('rotating a building in place', () => {
  it('turns around its middle tile and its belts follow the ports', () => {
    const world = makeWorld();
    unlock(world);
    // Multiplier (20..22, 20): A West, B East, O below the middle.
    const b = world.addBuilding('multiplier', 20, 20, 0);
    beltLine(world, 15, 20, E, 4); // → (19, 20) → A
    beltLine(world, 27, 20, W, 4); // → (23, 20) → B
    beltLine(world, 21, 21, S, 5); // O → (21, 21) → ...
    const to = rotatedOrigin(b, 1);
    expect(to).toEqual({ x: 21, y: 19, rot: 1 });
    const tools = new ToolController(world);
    tools.select(21, 20);
    expect(tools.canRotate).toBe(true);
    tools.rotate(1);
    expect(b).toMatchObject({ x: 21, y: 19, rot: 1 });
    // A is now at the top, B at the bottom, O on the West side (rotation 1).
    const ends = [reaches(world, 21, 18, S), reaches(world, 21, 22, N), reaches(world, 21, 20, W)];
    expect(ends).toEqual(['port A', 'port B', 'belt']);
    expect(tools.history.undoSize).toBe(1);
  });

  it('only operators rotate', () => {
    const world = makeWorld();
    unlock(world);
    world.addBuilding('storage', 20, 20, 0);
    const tools = new ToolController(world);
    tools.select(20, 20);
    expect(tools.canRotate).toBe(false);
    tools.select(0, 0);
    expect(tools.canRotate).toBe(false);
  });
});

describe('grabbing a building', () => {
  it('a finger only grabs the selected building; the mouse grabs any', () => {
    const world = adderFactory();
    const tools = new ToolController(world);
    expect(tools.grabsAt(20, 20, true)).toBe(false);
    expect(tools.grabsAt(20, 20, false)).toBe(true);
    expect(tools.grabsAt(0, 0, false)).toBe(false); // the hub
    tools.select(20, 20);
    expect(tools.grabsAt(21, 21, true)).toBe(true);
    tools.setTool('belt');
    expect(tools.grabsAt(21, 21, true)).toBe(false);
  });

  it('a press without moving is a click: it selects, nothing moves', () => {
    const world = adderFactory();
    const tools = new ToolController(world);
    tools.select(20, 20);
    tools.pointerDown(20, 20, TOUCH);
    tools.pointerUp(20, 20, TOUCH);
    expect(tools.history.canUndo).toBe(false);
    expect(tools.selection?.kind).toBe('building');
  });

  it('R while dragging turns the ghost; a cancelled drag moves nothing', () => {
    const world = adderFactory();
    const tools = new ToolController(world);
    tools.select(20, 20);
    tools.pointerDown(20, 20, TOUCH);
    tools.pointerMove(20, 26, TOUCH);
    tools.rotate(1);
    expect(tools.ghost().buildings[0]?.rot).toBe(1);
    tools.pointerCancel();
    expect(tools.ghost().buildings).toEqual([]);
    expect(world.buildingAt(20, 20)?.rot).toBe(0);
    expect(tools.history.canUndo).toBe(false);
  });
});
