import { describe, expect, it } from 'vitest';
import { clearArea, demolishArea, selectionRect } from '../../src/build/area';
import { applyPaste, copyArea, planPaste, transformClip } from '../../src/build/clipboard';
import { History } from '../../src/build/history';
import { ToolController } from '../../src/build/tools';
import { EDIT } from '../../src/config/balance';
import type { BuildingType } from '../../src/config/buildings';
import { E, key, N, S, transformDir, transformLocal, W } from '../../src/core/grid';
import { dirMask, footprintTiles, OPERATOR_TYPES, portFaces } from '../../src/sim/entities';
import { layoutString } from '../../src/sim/layout';
import { togglePriorityAt } from '../../src/sim/priority';
import { runTicks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { beltLine, makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };

function unlockAll(world: World): void {
  for (const b of [
    'adder',
    'multiplier',
    'subtractor',
    'divider',
    'exponent',
    'storage',
    'bridge',
  ] as const)
    world.state.unlockedBuildings.push(b);
  world.state.unlockedFeatures.push('priorities', 'upgrades');
}

/** A small factory away from the hub: operators, belts, a bridge, a storage, a priority. */
function buildFactory(world: World): void {
  unlockAll(world);
  world.addBuilding('adder', 20, 20, 0);
  world.addBuilding('subtractor', 24, 20, 1);
  world.addBuilding('multiplier', 20, 24, 0);
  world.addBuilding('storage', 26, 24, 0);
  beltLine(world, 20, 22, S, 2); // below the adder's output
  world.setBelt(21, 22, dirMask(S) | dirMask(E)); // a junction
  world.setBelt(22, 22, dirMask(E));
  world.setBelt(21, 23, dirMask(S));
  world.setBridge(23, 23, E, S);
  togglePriorityAt(world, 22, 22); // the junction's East output becomes prioritised
}

describe('selection zone', () => {
  it('is 1×1 on a click and capped at 128×128 in every direction', () => {
    expect(selectionRect({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({ x0: 3, y0: 4, x1: 3, y1: 4 });
    const big = selectionRect({ x: 0, y: 0 }, { x: 500, y: 300 });
    expect(big).toEqual({ x0: 0, y0: 0, x1: EDIT.maxSelection - 1, y1: EDIT.maxSelection - 1 });
    const back = selectionRect({ x: 0, y: 0 }, { x: -500, y: -10 });
    expect(back).toEqual({ x0: -127, y0: -10, x1: 0, y1: 0 });
  });

  it('a 200×200 drag demolishes only the 128×128 zone', () => {
    const world = makeWorld();
    world.setBelt(100, 100, dirMask(E));
    world.setBelt(100 + 127, 100 + 127, dirMask(E));
    world.setBelt(100 + 128, 100, dirMask(E));
    world.setBelt(100, 100 + 150, dirMask(E));
    const n = demolishArea(world, selectionRect({ x: 100, y: 100 }, { x: 300, y: 300 }));
    expect(n).toBe(2);
    expect(world.state.belts.size).toBe(2);
  });
});

describe('copy, paste, undo', () => {
  it('copy → paste → undo restores exactly the building state, redo replays it', () => {
    const world = makeWorld();
    buildFactory(world);
    const history = new History(world);
    // Things already in the paste area: belts (replaced) and a building (conflict, kept).
    beltLine(world, 60, 22, N, 3);
    world.addBuilding('divider', 66, 24, 0);
    const adder = world.state.buildings.get(1);
    adder?.inA?.push(5);
    const before = layoutString(world);

    const clip = copyArea(world, selectionRect({ x: 20, y: 20 }, { x: 28, y: 26 }));
    if (!clip) throw new Error('nothing copied');
    expect(clip.buildings).toHaveLength(4);
    expect(clip.bridges).toHaveLength(1);
    const placed = history.run(() => applyPaste(world, planPaste(world, clip, 60, 20)));
    expect(placed).toBeGreaterThan(5);
    const after = layoutString(world);
    expect(after).not.toBe(before);
    expect(world.state.buildings.size).toBe(1 + 4 + 1 + 3); // hub, originals, divider, pasted

    expect(history.undo()).toBe(true);
    expect(layoutString(world)).toBe(before);
    expect(adder?.inA).toEqual([5]); // untouched buildings keep their buffers
    expect(history.redo()).toBe(true);
    expect(layoutString(world)).toBe(after);
    expect(history.undo()).toBe(true);
    expect(layoutString(world)).toBe(before);
  });

  it('cut → undo restores the buildings (not their items)', () => {
    const world = makeWorld();
    buildFactory(world);
    const tools = new ToolController(world);
    const before = layoutString(world);
    const st = [...world.state.buildings.values()].find((b) => b.type === 'storage');
    if (!st) throw new Error();
    st.storeValue = 4;
    st.storeCount = 100;
    expect(tools.copyRect(selectionRect({ x: 20, y: 20 }, { x: 28, y: 26 }), true)).toBe(true);
    expect(world.state.buildings.size).toBe(1);
    expect(world.state.belts.size).toBe(0);
    expect(tools.tool).toBe('paste');
    tools.undo();
    expect(layoutString(world)).toBe(before);
    const restored = [...world.state.buildings.values()].find((b) => b.type === 'storage');
    expect(restored?.storeCount).toBe(0);
  });

  it('pasting keeps priorities and belt outputs', () => {
    const world = makeWorld();
    buildFactory(world);
    const clip = copyArea(world, selectionRect({ x: 20, y: 22 }, { x: 22, y: 22 }));
    if (!clip) throw new Error();
    applyPaste(world, planPaste(world, clip, 40, 40));
    const j = world.beltAt(41, 40);
    expect(j?.outputs).toBe(dirMask(S) | dirMask(E));
    expect(j?.priority).toBe(E);
  });

  it('an extractor is pasted only exactly on an extractable deposit', () => {
    const world = makeWorld();
    const d = world.deposits.findNearest(1);
    if (!d) throw new Error();
    const ex = world.addBuilding('extractor', d.x - 1, d.y - 1, 0, { extractValue: 1 });
    const clip = copyArea(world, selectionRect({ x: d.x, y: d.y }, { x: d.x, y: d.y }));
    if (!clip) throw new Error();
    world.removeBuilding(ex.id);
    expect(planPaste(world, clip, d.x - 1, d.y - 1).buildings[0]?.ok).toBe(true);
    expect(planPaste(world, clip, d.x, d.y - 1).buildings[0]?.ok).toBe(false);
    expect(planPaste(world, clip, 200, 200).buildings[0]?.ok).toBe(false);
  });

  it('dragging in paste mode lays a row of copies', () => {
    const world = makeWorld();
    unlockAll(world);
    world.addBuilding('adder', 20, 20, 0);
    const tools = new ToolController(world);
    tools.copyRect(selectionRect({ x: 20, y: 20 }, { x: 21, y: 21 }), false);
    tools.pointerMove(40, 40, NO_MODS);
    tools.pointerDown(40, 40, NO_MODS);
    tools.pointerMove(47, 41, NO_MODS);
    tools.pointerUp(47, 41, NO_MODS);
    // 2-wide adder, drag of 7 tiles: 4 copies.
    expect([...world.state.buildings.values()].filter((b) => b.type === 'adder')).toHaveLength(5);
    expect(tools.history.undoSize).toBe(1);
  });
});

describe('mirror and rotation', () => {
  it('a mirrored subtractor still computes A − B, only the positions change', () => {
    const world = makeWorld();
    unlockAll(world);
    world.addBuilding('subtractor', 20, 20, 0); // A (20,20), O (20,21), B (21,21)
    const clip = copyArea(world, selectionRect({ x: 20, y: 20 }, { x: 21, y: 21 }));
    if (!clip) throw new Error();
    const mirrored = transformClip(clip, 0, true);
    expect(mirrored.buildings[0]).toMatchObject({ type: 'subtractor', mirror: true, rot: 0 });
    applyPaste(world, planPaste(world, mirrored, 40, 20));
    const sub = [...world.state.buildings.values()].find((b) => b.x === 40);
    if (!sub) throw new Error();
    const roleAt = (x: number, y: number): string | undefined =>
      footprintTiles(sub.type, sub.x, sub.y, sub.rot, sub.mirror).find(
        (t) => t.x === x && t.y === y,
      )?.role;
    expect(roleAt(41, 20)).toBe('A');
    expect(roleAt(41, 21)).toBe('O');
    expect(roleAt(40, 21)).toBe('B');
    // Faces are mirrored too: A by N, E, W stays N, E, W; B by N, E, S becomes N, W, S.
    const faces = portFaces(sub.type, sub.x, sub.y, sub.rot, sub.mirror);
    expect(faces.filter((f) => f.kind === 'B').map((f) => f.face)).toEqual([N, S, W]);
    // Feed A = 10 through its north face and B = 3 through its north face.
    world.setBelt(41, 19, dirMask(S));
    world.setBelt(40, 20, dirMask(S));
    const a = world.beltAt(41, 19);
    const b = world.beltAt(40, 20);
    if (!a || !b) throw new Error();
    a.item = { value: 10, progress: 0.5, from: null, stamp: 0 };
    b.item = { value: 3, progress: 0.5, from: null, stamp: 0 };
    runTicks(world, 60 * 6);
    expect(sub.out).toEqual([7]);
  });

  it('transformed footprints and ports match the transformed original, for every case', () => {
    const types: BuildingType[] = [...OPERATOR_TYPES, 'storage'];
    let checked = 0;
    for (const type of types) {
      for (const rot of [0, 1, 2, 3]) {
        for (const mirror of [false, true]) {
          const world = makeWorld();
          unlockAll(world);
          const b = world.addBuilding(type, 30, 30, rot as 0 | 1 | 2 | 3, { mirror });
          const clip = copyArea(world, selectionRect({ x: 30, y: 30 }, { x: 32, y: 32 }));
          if (!clip) throw new Error();
          const src = portFaces(b.type, b.x, b.y, b.rot, b.mirror);
          for (const pr of [0, 1, 2, 3]) {
            for (const pm of [false, true]) {
              const tc = transformClip(clip, pr, pm);
              const cb = tc.buildings[0];
              if (!cb) throw new Error();
              const got = portFaces(cb.type, cb.x, cb.y, cb.rot, cb.mirror)
                .map((f) => `${f.x},${f.y},${f.face},${f.kind}`)
                .sort();
              const want = src
                .map((f) => {
                  const p = transformLocal(f.x - 30, f.y - 30, clip.w, clip.h, pr, pm);
                  return `${p.x},${p.y},${transformDir(f.face, pr, pm)},${f.kind}`;
                })
                .sort();
              expect(got).toEqual(want);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(6 * 8 * 8);
  });

  it('F mirrors the preview as shown, R rotates it', () => {
    const world = makeWorld();
    world.setBelt(20, 20, dirMask(E));
    world.setBelt(20, 21, dirMask(N));
    const tools = new ToolController(world);
    tools.copyRect(selectionRect({ x: 20, y: 20 }, { x: 20, y: 21 }), false);
    tools.rotate(1); // E→S, N→E
    tools.mirror(); // then mirror: S stays S, E→W
    const clip = tools.currentClip();
    expect(clip?.belts.map((b) => b.outputs).sort()).toEqual([dirMask(S), dirMask(W)].sort());
  });
});

describe('zone tools', () => {
  it('demolish zone ignores the hub and is undoable', () => {
    const world = makeWorld();
    buildFactory(world);
    const history = new History(world);
    const before = layoutString(world);
    history.run(() => demolishArea(world, selectionRect({ x: -10, y: -10 }, { x: 40, y: 40 })));
    expect([...world.state.buildings.values()].map((b) => b.type)).toEqual(['hub']);
    expect(world.state.belts.size + world.state.bridges.size).toBe(0);
    history.undo();
    expect(layoutString(world)).toBe(before);
  });

  it('clear zone removes items, buffers and stock but keeps buildings', () => {
    const world = makeWorld();
    buildFactory(world);
    const adder = world.state.buildings.get(1);
    const st = [...world.state.buildings.values()].find((b) => b.type === 'storage');
    if (!adder || !st) throw new Error();
    adder.inA?.push(1, 2);
    adder.out?.push(3);
    adder.cycle = 0.5;
    st.storeValue = 9;
    st.storeCount = 42;
    const belt = world.beltAt(20, 22);
    if (belt) belt.item = { value: 1, progress: 0.2, from: null, stamp: 0 };
    const before = layoutString(world);
    const n = clearArea(world, selectionRect({ x: 19, y: 19 }, { x: 30, y: 30 }));
    expect(n).toBe(2 + 1 + 42 + 1);
    expect(adder.inA).toEqual([]);
    expect(adder.out).toEqual([]);
    expect(adder.cycle).toBe(-1);
    expect(st).toMatchObject({ storeValue: null, storeCount: 0 });
    expect(belt?.item).toBeNull();
    expect(layoutString(world)).toBe(before);
  });
});

describe('history', () => {
  it('keeps 100 actions and a new action clears redo', () => {
    const world = makeWorld();
    const history = new History(world);
    for (let i = 0; i < 120; i++) history.run(() => world.setBelt(10 + i, 10, dirMask(E)));
    expect(history.undoSize).toBe(EDIT.historySize);
    let undone = 0;
    while (history.undo()) undone++;
    expect(undone).toBe(100);
    expect(world.state.belts.size).toBe(20);
    history.run(() => world.setBelt(0, 50, dirMask(E)));
    expect(history.canRedo).toBe(false);
  });

  it('an action that changes nothing is not recorded', () => {
    const world = makeWorld();
    world.setBelt(10, 10, dirMask(E));
    const history = new History(world);
    history.run(() => world.setBelt(10, 10, dirMask(E)));
    history.run(() => clearArea(world, selectionRect({ x: 0, y: 0 }, { x: 20, y: 20 })));
    expect(history.canUndo).toBe(false);
  });

  it('undoes priorities, bridges and building replacement of belts', () => {
    const world = makeWorld();
    buildFactory(world);
    const history = new History(world);
    const before = layoutString(world);
    history.run(() => togglePriorityAt(world, 21, 23)); // move the priority to the S output
    expect(world.beltAt(21, 22)?.priority).toBe(S);
    history.run(() => world.addBuilding('adder', 22, 22, 0)); // over belts and the bridge
    expect(world.bridgeAt(23, 23)).toBeNull();
    history.undo();
    history.undo();
    expect(layoutString(world)).toBe(before);
    expect(world.beltAt(21, 22)?.priority).toBe(E);
  });

  it('undo after a building was demolished brings it back with the same id', () => {
    const world = makeWorld();
    unlockAll(world);
    const history = new History(world);
    const b = history.run(() => world.addBuilding('divider', 30, 30, 2));
    history.run(() => world.removeBuilding(b.id));
    history.undo();
    expect(world.state.buildings.get(b.id)).toMatchObject({ type: 'divider', rot: 2 });
    expect(world.buildingAt(30, 30)?.id).toBe(b.id);
    history.undo();
    expect(world.state.buildings.has(b.id)).toBe(false);
  });
});

describe('clipboard history, markers, pipette', () => {
  it('keeps 20 entries, cycles and removes', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    for (let i = 0; i < 25; i++) {
      world.setBelt(10 + i, 10, dirMask(E));
      tools.copyRect(selectionRect({ x: 10 + i, y: 10 }, { x: 10 + i, y: 10 }), false);
    }
    expect(world.state.clipboard).toHaveLength(EDIT.clipboardSize);
    tools.cycleClip(-1);
    expect(tools.clipIndex).toBe(19);
    tools.cycleClip(1);
    expect(tools.clipIndex).toBe(0);
    tools.removeClip();
    expect(world.state.clipboard).toHaveLength(19);
    expect(tools.copyRect(selectionRect({ x: 0, y: 40 }, { x: 5, y: 45 }), false)).toBe(false);
  });

  it('markers are created, edited, deleted and undoable', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setMarker(5, 6, '  Usine de 7 ');
    expect(world.state.markers.get(key(5, 6))?.text).toBe('Usine de 7');
    tools.setMarker(5, 6, 'Usine de 9');
    tools.setMarker(5, 6, '');
    expect(world.state.markers.size).toBe(0);
    tools.undo();
    expect(world.state.markers.get(key(5, 6))?.text).toBe('Usine de 9');
    tools.undo();
    tools.undo();
    expect(world.state.markers.size).toBe(0);
  });

  it('clicking a marker opens the editor, the marker tool too on an empty tile', () => {
    const world = makeWorld();
    const opened: (string | null)[] = [];
    const tools = new ToolController(world, { onMarker: (_x, _y, text) => opened.push(text) });
    tools.setMarker(5, 6, 'A');
    tools.pointerUp(5, 6, NO_MODS);
    tools.pointerUp(7, 7, NO_MODS); // no tool, no marker: nothing
    tools.setTool('marker');
    tools.pointerUp(8, 8, NO_MODS);
    expect(opened).toEqual(['A', null]);
  });

  it('the pipette picks the hovered type and orientation', () => {
    const world = makeWorld();
    unlockAll(world);
    world.addBuilding('multiplier', 30, 30, 1);
    world.setBelt(40, 40, dirMask(W));
    const tools = new ToolController(world);
    tools.pointerMove(30, 31, NO_MODS);
    tools.pick();
    expect(tools.tool).toBe('multiplier');
    expect(tools.rot).toBe(1);
    tools.pointerMove(40, 40, NO_MODS);
    tools.pick();
    expect(tools.tool).toBe('belt');
    expect(tools.beltDir).toBe(W);
  });
});

describe('interrupted gestures (touch)', () => {
  it('a cancelled drag builds nothing', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerMove(14, 10, NO_MODS);
    expect(tools.ghost().belts.length).toBe(5);
    tools.pointerCancel();
    // The drag is gone: only the single hovered tile is previewed, and nothing was built.
    expect(tools.ghost().belts.length).toBe(1);
    expect(world.state.belts.size).toBe(0);
    expect(tools.history.canUndo).toBe(false);
  });

  it('clearing the hover removes the ghost and the hovered tile', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    tools.pointerDown(10, 10, NO_MODS);
    tools.pointerMove(12, 10, NO_MODS);
    tools.clearHover();
    expect(tools.hovered).toBeNull();
    expect(tools.ghost()).toEqual({ belts: [], buildings: [], demolish: null, area: null });
    expect(world.state.belts.size).toBe(0);
  });
});

describe('touch replacements for keys', () => {
  it('the elbow toggle swaps the first axis of a belt drag, and Ctrl inverts it back', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    tools.setTool('belt');
    const corner = (ctrl: boolean): string => {
      tools.pointerDown(10, 10, NO_MODS);
      tools.pointerMove(13, 12, { ...NO_MODS, ctrl });
      const tiles = tools.ghost().belts.map((b) => `${b.x},${b.y}`);
      tools.pointerCancel();
      return tiles.includes('13,10') ? 'horizontal first' : 'vertical first';
    };
    const normal = corner(false);
    expect(corner(true)).not.toBe(normal);
    tools.toggleElbow();
    expect(tools.elbowSwap).toBe(true);
    expect(corner(false)).not.toBe(normal);
    expect(corner(true)).toBe(normal);
  });

  it('pick works on a given tile, without a hovered one', () => {
    const world = makeWorld();
    unlockAll(world);
    world.addBuilding('adder', 20, 20, 1);
    world.setBelt(30, 30, dirMask(S));
    const tools = new ToolController(world);
    expect(tools.pick()).toBe(false); // nothing hovered
    expect(tools.pick({ x: 0, y: 0 })).toBe(false); // the hub cannot be picked
    expect(tools.pick({ x: 50, y: 50 })).toBe(false);
    expect(tools.pick({ x: 20, y: 20 })).toBe(true);
    expect(tools.tool).toBe('adder');
    expect(tools.rot).toBe(1);
    expect(tools.pick({ x: 30, y: 30 })).toBe(true);
    expect(tools.tool).toBe('belt');
    expect(tools.beltDir).toBe(S);
  });

  it('only tools whose result depends on the rotation offer to rotate', () => {
    const world = makeWorld();
    unlockAll(world);
    world.setBelt(30, 30, dirMask(E));
    const tools = new ToolController(world);
    const rotatable = (tool: Parameters<ToolController['setTool']>[0]): boolean => {
      tools.setTool(tool);
      const yes = tools.canRotate;
      tools.setTool('none');
      return yes;
    };
    expect(['belt', 'bridge', 'adder', 'divider'].map((t) => rotatable(t as 'belt'))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(
      ['extractor', 'storage', 'demolish', 'marker', 'priority'].map((t) => rotatable(t as 'belt')),
    ).toEqual([false, false, false, false, false]);
    expect(tools.copyRect({ x0: 30, y0: 30, x1: 30, y1: 30 }, false)).toBe(true);
    expect(tools.tool).toBe('paste');
    expect(tools.canRotate).toBe(true);
  });
});

describe('pasting with a finger: put down, then confirm', () => {
  const TOUCH_MODS = { ...NO_MODS, touch: true };

  function pasteTool(): { world: World; tools: ToolController } {
    const world = makeWorld();
    world.setBelt(30, 30, dirMask(E));
    const tools = new ToolController(world);
    expect(tools.copyRect({ x0: 30, y0: 30, x1: 30, y1: 30 }, false)).toBe(true);
    return { world, tools };
  }

  it('a tap only puts the preview down; confirming builds, once', () => {
    const { world, tools } = pasteTool();
    expect(tools.pastePending).toBe(false);
    tools.pointerDown(40, 40, TOUCH_MODS);
    tools.pointerUp(40, 40, TOUCH_MODS);
    tools.clearHover(); // the finger is up
    expect(world.state.belts.size).toBe(1);
    expect(tools.pastePending).toBe(true);
    expect(tools.ghost().belts.map((b) => [b.x, b.y])).toEqual([[40, 40]]);

    expect(tools.confirmPaste()).toBe(true);
    expect(world.beltAt(40, 40)).toBeTruthy();
    expect(tools.pastePending).toBe(false);
    expect(tools.ghost().belts).toEqual([]);
    expect(tools.confirmPaste()).toBe(false);
    expect(world.state.belts.size).toBe(2);
    expect(tools.undo()).toBe(true);
    expect(world.state.belts.size).toBe(1);
  });

  it('dragging moves the preview instead of laying a row of copies', () => {
    const { world, tools } = pasteTool();
    tools.pointerDown(40, 40, TOUCH_MODS);
    tools.pointerMove(46, 40, TOUCH_MODS);
    expect(tools.ghost().belts.map((b) => [b.x, b.y])).toEqual([[46, 40]]);
    tools.pointerUp(47, 41, TOUCH_MODS);
    tools.clearHover();
    expect(tools.ghost().belts.map((b) => [b.x, b.y])).toEqual([[47, 41]]);
    expect(world.state.belts.size).toBe(1);
  });

  it('a cancelled gesture puts the preview back where it was', () => {
    const { tools } = pasteTool();
    tools.placePastePreview(40, 40);
    tools.pointerDown(50, 50, TOUCH_MODS); // first finger of a pinch
    tools.pointerCancel();
    tools.clearHover();
    expect(tools.ghost().belts.map((b) => [b.x, b.y])).toEqual([[40, 40]]);
  });

  it('rotating and leaving the tool', () => {
    const { tools } = pasteTool();
    tools.placePastePreview(40, 40);
    tools.rotate(1);
    expect(tools.pastePending).toBe(true);
    tools.setTool('none');
    expect(tools.pastePending).toBe(false);
    tools.placePastePreview(40, 40); // ignored outside paste mode
    expect(tools.pastePending).toBe(false);
  });

  it('a mouse takes the preview back, and a click still pastes at once', () => {
    const { world, tools } = pasteTool();
    tools.placePastePreview(40, 40);
    tools.pointerMove(60, 60, NO_MODS);
    expect(tools.pastePending).toBe(false);
    expect(tools.ghost().belts.map((b) => [b.x, b.y])).toEqual([[60, 60]]);
    tools.pointerDown(60, 60, NO_MODS);
    tools.pointerUp(60, 60, NO_MODS);
    expect(world.beltAt(60, 60)).toBeTruthy();
  });

  it('when nothing can be placed the preview stays, to be moved', () => {
    const { world, tools } = pasteTool();
    unlockAll(world);
    world.addBuilding('adder', 50, 50, 0);
    tools.placePastePreview(50, 50); // a belt cannot be pasted on a building
    expect(tools.confirmPaste()).toBe(false);
    expect(tools.pastePending).toBe(true);
  });
});

describe('history feedback', () => {
  it('reports each applied change with its direction', () => {
    const world = makeWorld();
    const tools = new ToolController(world);
    const seen: string[] = [];
    tools.history.onApplied((change, side) => seen.push(`${side}:${change.tiles.size}`));
    tools.history.run(() => world.setBelt(40, 40, 2));
    tools.undo();
    tools.redo();
    expect(seen).toEqual(['after:1', 'before:1', 'after:1']);
  });
});
