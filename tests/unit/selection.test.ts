import { describe, expect, it } from 'vitest';
import { ToolController } from '../../src/build/tools';
import { E, S } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };

function click(tools: ToolController, x: number, y: number): void {
  tools.pointerDown(x, y, NO_MODS);
  tools.pointerUp(x, y, NO_MODS);
}

describe('selection without a tool', () => {
  it('a click selects a building, and it stays selected until a click elsewhere', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('adder');
    const adder = world.addBuilding('adder', 20, 20, 0);
    const tools = new ToolController(world);
    click(tools, 21, 21);
    expect(tools.selection).toEqual({ kind: 'building', id: adder.id });
    expect(tools.selectionRect).toEqual({ x0: 20, y0: 20, x1: 21, y1: 21 });
    // Moving the pointer around does not drop it.
    tools.pointerMove(40, 40, NO_MODS);
    tools.clearHover();
    expect(tools.selection).not.toBeNull();
    // A click on empty ground does.
    click(tools, 40, 40);
    expect(tools.selection).toBeNull();
  });

  it('a click on a belt selects its tile, a click on another object moves the selection', () => {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    world.setBelt(31, 30, dirMask(S));
    const tools = new ToolController(world);
    click(tools, 30, 30);
    expect(tools.selection).toEqual({ kind: 'tile', x: 30, y: 30 });
    click(tools, 31, 30);
    expect(tools.selection).toEqual({ kind: 'tile', x: 31, y: 30 });
  });

  it('Escape and choosing a tool drop the selection', () => {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    const tools = new ToolController(world);
    click(tools, 30, 30);
    tools.cancel();
    expect(tools.selection).toBeNull();
    expect(tools.tool).toBe('none');
    click(tools, 30, 30);
    tools.setTool('belt');
    expect(tools.selection).toBeNull();
  });

  it('the selection goes away with its object (demolished, undone)', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    click(tools, 30, 30);
    tools.setTool('none');
    click(tools, 30, 30);
    expect(tools.selection).not.toBeNull();
    tools.undo();
    expect(tools.selection).toBeNull();
  });

  it('delete demolishes the selection in one undoable step; the hub cannot be deleted', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('adder');
    world.addBuilding('adder', 20, 20, 0);
    const tools = new ToolController(world);
    click(tools, 20, 20);
    expect(tools.canDeleteSelection).toBe(true);
    tools.deletePressed();
    expect(world.buildingAt(20, 20)).toBeNull();
    expect(tools.selection).toBeNull();
    tools.undo();
    expect(world.buildingAt(20, 20)?.type).toBe('adder');

    click(tools, 0, 0);
    expect(tools.selection?.kind).toBe('building');
    expect(tools.canDeleteSelection).toBe(false);
    expect(tools.canPickSelection).toBe(false);
    expect(tools.deleteSelection()).toBe(false);
  });

  it('the pipette on the selection takes its tool and orientation', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('multiplier');
    world.addBuilding('multiplier', 20, 20, 1);
    const tools = new ToolController(world);
    click(tools, 20, 21);
    expect(tools.canPickSelection).toBe(true);
    expect(tools.pickSelection()).toBe(true);
    expect(tools.tool).toBe('multiplier');
    expect(tools.rot).toBe(1);
    expect(tools.selection).toBeNull();
  });

  it('copy takes the selected building alone, then pastes it facing the same way', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('multiplier');
    world.addBuilding('multiplier', 20, 20, 1); // vertical: (20, 20) to (20, 22)
    world.setBelt(20, 23, dirMask(S)); // touching it, but not copied
    const tools = new ToolController(world);
    click(tools, 20, 21);
    expect(tools.canCopySelection).toBe(true);
    expect(tools.copySelection()).toBe(true);
    expect(tools.tool).toBe('paste');
    expect(world.state.clipboard).toHaveLength(1);
    const clip = world.state.clipboard[0];
    expect(clip?.belts).toEqual([]);
    expect(clip?.buildings).toEqual([
      { type: 'multiplier', x: 0, y: 0, rot: 1, mirror: false, priority: null },
    ]);
    // The paste builds a second one, in the same orientation.
    click(tools, 30, 30);
    const copies = [...world.state.buildings.values()].filter((b) => b.type === 'multiplier');
    expect(copies).toHaveLength(2);
    expect(copies.every((b) => b.rot === 1)).toBe(true);
  });

  it('the hub and belts cannot be copied from the selection', () => {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    const tools = new ToolController(world);
    click(tools, 0, 0); // the hub
    expect(tools.selection?.kind).toBe('building');
    expect(tools.canCopySelection).toBe(false);
    expect(tools.copySelection()).toBe(false);
    click(tools, 30, 30);
    expect(tools.canCopySelection).toBe(false);
    expect(world.state.clipboard).toHaveLength(0);
  });
});

function drag(tools: ToolController, from: [number, number], to: [number, number]): void {
  tools.pointerDown(from[0], from[1], NO_MODS);
  tools.pointerMove(to[0], to[1], NO_MODS);
  tools.pointerUp(to[0], to[1], NO_MODS);
}

describe('zone selection (select tool) and the copy target', () => {
  it('nothing selected: no copy target', () => {
    const tools = new ToolController(makeWorld());
    expect(tools.copyTarget).toBeNull();
    tools.setTool('select');
    expect(tools.copyTarget).toBeNull();
    expect(tools.copyTargetRect(false)).toBe(false);
  });

  it('a drag selects a zone that stays drawn; a click or another tool drops it', () => {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    const tools = new ToolController(world);
    tools.setTool('select');
    drag(tools, [29, 29], [32, 31]);
    const zone = { x0: 29, y0: 29, x1: 32, y1: 31 };
    expect(tools.selectedZone).toEqual(zone);
    expect(tools.copyTarget).toEqual(zone);
    expect(tools.tool).toBe('select');
    // Still drawn once the pointer has left the map (finger lifted).
    tools.clearHover();
    expect(tools.ghost().area).toEqual({ rect: zone, kind: 'select' });
    // A click drops it.
    click(tools, 40, 40);
    expect(tools.selectedZone).toBeNull();
    // As does another tool.
    drag(tools, [29, 29], [32, 31]);
    tools.setTool('belt');
    expect(tools.selectedZone).toBeNull();
    expect(tools.copyTarget).toBeNull();
  });

  it('cancel drops the zone first, then the tool', () => {
    const tools = new ToolController(makeWorld());
    tools.setTool('select');
    drag(tools, [1, 1], [3, 3]);
    tools.cancel();
    expect(tools.selectedZone).toBeNull();
    expect(tools.tool).toBe('select');
    tools.cancel();
    expect(tools.tool).toBe('none');
  });

  it('copy and cut act on the selected zone, then switch to paste mode', () => {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    world.setBelt(31, 30, dirMask(E));
    const tools = new ToolController(world);
    tools.setTool('select');
    drag(tools, [30, 30], [31, 30]);
    expect(tools.copyTargetRect(false)).toBe(true);
    expect(tools.tool).toBe('paste');
    expect(world.state.clipboard[0]?.belts).toHaveLength(2);
    expect(world.state.belts.size).toBe(2);

    tools.setTool('select');
    drag(tools, [30, 30], [31, 30]);
    expect(tools.copyTargetRect(true)).toBe(true);
    expect(world.state.clipboard).toHaveLength(2);
    expect(world.state.belts.size).toBe(0);
    // The cut is one undoable action.
    tools.undo();
    expect(world.state.belts.size).toBe(2);
  });

  it('without a tool, the selected building is the copy target (not the hub)', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('adder');
    world.addBuilding('adder', 20, 20, 0);
    const tools = new ToolController(world);
    click(tools, 21, 21);
    expect(tools.copyTarget).toEqual({ x0: 20, y0: 20, x1: 21, y1: 21 });
    expect(tools.copyTargetRect(true)).toBe(true);
    expect(world.buildingAt(20, 20)).toBeNull();
    expect(tools.tool).toBe('paste');
    tools.setTool('paste');
    click(tools, 0, 0); // the hub
    expect(tools.copyTarget).toBeNull();
  });
});
