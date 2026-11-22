import { describe, expect, it } from 'vitest';
import { demolishArea, selectionRect } from '../../src/build/area';
import { applyPaste, copyArea, planPaste, planPasteRow } from '../../src/build/clipboard';
import { applyMove, planMove } from '../../src/build/move';
import { applyBuildingPlan, demolishAt, planOperator } from '../../src/build/placement';
import { ToolController } from '../../src/build/tools';
import { operatorSpeed } from '../../src/config/balance';
import { BUILDINGS, SPECIAL_BUILDINGS, SPECIAL_TYPES } from '../../src/config/buildings';
import { CARDS } from '../../src/config/cards';
import { SaveError, validateSave } from '../../src/save/schema';
import { deserialize, serialize, stateHash } from '../../src/save/serialize';
import { compute, cycleDuration } from '../../src/sim/operators';
import {
  applyEdition,
  editionCheck,
  freeEditionCards,
  freeSpecials,
  specialStock,
} from '../../src/sim/inventory';
import { grantCard } from '../../src/sim/rewards';
import { runTicks } from '../../src/sim/tick';
import { World } from '../../src/sim/world';
import { DepositMap } from '../../src/world/chunks';
import { makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };
const LEG = 'ancientAdder:legendaire';
const BASE = 'ancientAdder:base';

interface Setup {
  world: World;
  tools: ToolController;
  errors: number;
}

/** A world with `specials` owned (by `"type:edition"`) and tools. */
function setup(specials: Record<string, number> = { [LEG]: 1 }): Setup {
  const world = makeWorld();
  world.state.unlockedBuildings.push('adder', 'multiplier', 'storage', 'bridge');
  world.state.specials = { ...specials };
  const s: Setup = { world, tools: null as unknown as ToolController, errors: 0 };
  s.tools = new ToolController(world, { onError: () => s.errors++ });
  return s;
}

function click(s: Setup, x: number, y: number): void {
  s.tools.pointerDown(x, y, NO_MODS);
  s.tools.pointerUp(x, y, NO_MODS);
}

function specials(world: World) {
  return [...world.state.buildings.values()].filter((b) => b.type === 'ancientAdder');
}

describe('special building: catalogue and behaviour', () => {
  it('is a placeholder, has the footprint and ports of what it imitates, and a card', () => {
    for (const type of SPECIAL_TYPES) {
      const def = SPECIAL_BUILDINGS[type];
      expect(def.placeholder).toBe(true);
      expect(BUILDINGS[type]).toEqual(BUILDINGS[def.like]);
      expect(CARDS.some((c) => c.effect.kind === 'special' && c.effect.building === type)).toBe(
        true,
      );
    }
  });

  it('computes A + B, at the adder track speed times its edition', () => {
    const s = setup();
    expect(compute('ancientAdder', 4, 7)).toEqual({ o: 11 });
    s.world.state.upgrades.adder = 3;
    const base = 1 / operatorSpeed('adder', 3);
    expect(cycleDuration(s.world, { type: 'ancientAdder' })).toBeCloseTo(base, 10);
    expect(cycleDuration(s.world, { type: 'ancientAdder', edition: 'legendaire' })).toBeCloseTo(
      base / 1.5,
      10,
    );
    // On the map: fed constantly, it adds.
    const b = s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    b.inA = [2];
    b.inB = [3];
    runTicks(s.world, 120);
    expect(b.out).toEqual([5]);
  });
});

describe('special buildings: placing is limited by free copies', () => {
  it('the tool shows once owned, places the chosen native edition, refuses at 0', () => {
    const s = setup({});
    expect(s.tools.isAvailable('ancientAdder')).toBe(false);
    grantCard(s.world.state, 'ancient-adder', 'legendaire');
    expect(s.tools.isAvailable('ancientAdder')).toBe(true);
    s.tools.setTool('ancientAdder');
    expect(s.tools.specialVariant('ancientAdder')).toBe('legendaire');
    s.tools.pointerMove(20, 20, NO_MODS);
    expect(s.tools.ghost().buildings).toMatchObject([{ ok: true, edition: 'legendaire' }]);
    click(s, 20, 20);
    const placed = specials(s.world);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ edition: 'legendaire' });
    expect(placed[0]?.editionApplied).toBeUndefined();
    expect(freeSpecials(s.world.state, LEG)).toBe(0);
    // None left: the ghost is red, a click fails; the tool stays (one is placed).
    s.tools.pointerMove(30, 20, NO_MODS);
    expect(s.tools.ghost().buildings).toMatchObject([{ ok: false }]);
    click(s, 30, 20);
    expect(specials(s.world)).toHaveLength(1);
    expect(s.errors).toBe(1);
    expect(s.tools.isAvailable('ancientAdder')).toBe(true);
    expect(specialStock(s.world.state, 'ancientAdder')).toEqual([
      { edition: 'legendaire', obtained: 1, placed: 1, free: 0 },
    ]);
    // Without a free copy, the plan itself refuses.
    expect(planOperator(s.world, 'ancientAdder', 40, 20, 0, 'legendaire').ok).toBe(false);
    expect(
      applyBuildingPlan(s.world, { type: 'ancientAdder', x: 40, y: 20, rot: 0, ok: true }),
    ).toBeNull();
  });

  it('a row stops at the last free copy', () => {
    const s = setup({ [BASE]: 2 });
    s.tools.setTool('ancientAdder');
    s.tools.pointerDown(20, 20, NO_MODS);
    s.tools.pointerMove(30, 20, NO_MODS);
    const plans = s.tools.ghost().buildings;
    expect(plans.length).toBeGreaterThan(2);
    expect(plans.map((p) => p.ok)).toEqual(plans.map((_, i) => i < 2));
    s.tools.pointerUp(30, 20, NO_MODS);
    expect(specials(s.world)).toHaveLength(2);
    expect(freeSpecials(s.world.state, BASE)).toBe(0);
  });

  it('the key cycles the native editions owned; one edition only puts the tool down', () => {
    const s = setup({ [BASE]: 1, [LEG]: 1 });
    expect(s.tools.specialKey('ancientAdder')).toBe(true);
    expect(s.tools.tool).toBe('ancientAdder');
    expect(s.tools.specialVariant('ancientAdder')).toBe('base');
    s.tools.specialKey('ancientAdder');
    expect(s.tools.specialVariant('ancientAdder')).toBe('legendaire');
    s.tools.specialKey('ancientAdder');
    expect(s.tools.specialVariant('ancientAdder')).toBe('base');
    const one = setup({ [LEG]: 1 });
    one.tools.specialKey('ancientAdder');
    one.tools.specialKey('ancientAdder');
    expect(one.tools.tool).toBe('none');
    expect(setup({}).tools.specialKey('ancientAdder')).toBe(false);
  });

  it('choosing the tool again moves to an edition that still has a free copy', () => {
    const s = setup({ [BASE]: 1, [LEG]: 1 });
    s.world.addBuilding('ancientAdder', 20, 20, 0);
    s.tools.setTool('ancientAdder');
    expect(s.tools.specialVariant('ancientAdder')).toBe('legendaire');
  });
});

describe('special buildings: demolish, move, undo, paste, pipette (§3.5)', () => {
  it('every way of demolishing gives it back with its native edition', () => {
    const s = setup({ [LEG]: 1 });
    const place = () => s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    place();
    demolishAt(s.world, 20, 20);
    expect(freeSpecials(s.world.state, LEG)).toBe(1);
    place();
    demolishArea(s.world, selectionRect({ x: 19, y: 19 }, { x: 22, y: 22 }));
    expect(freeSpecials(s.world.state, LEG)).toBe(1);
    place();
    s.tools.copyRect(selectionRect({ x: 20, y: 20 }, { x: 21, y: 21 }), true); // cut
    expect(freeSpecials(s.world.state, LEG)).toBe(1);
    // The cut copy pastes it back, with its edition.
    expect(s.world.state.clipboard[0]?.buildings[0]).toMatchObject({ edition: 'legendaire' });
  });

  it('a base special takes an edition card; demolishing it gives back both', () => {
    const s = setup({ [BASE]: 1 });
    s.world.state.editionCards.brillante = 1;
    const b = s.world.addBuilding('ancientAdder', 20, 20, 0);
    expect(editionCheck(s.world.state, b, 'brillante')).toBe('apply');
    expect(applyEdition(s.world, b, 'brillante')).toBe(true);
    expect(freeEditionCards(s.world.state, 'brillante')).toBe(0);
    expect(freeSpecials(s.world.state, BASE)).toBe(0);
    s.tools.history.run(() => demolishAt(s.world, 20, 20));
    expect(freeEditionCards(s.world.state, 'brillante')).toBe(1);
    expect(freeSpecials(s.world.state, BASE)).toBe(1);
    // Undo: both come back on the map.
    s.tools.undo();
    expect(s.world.buildingAt(20, 20)).toMatchObject({
      edition: 'brillante',
      editionApplied: true,
    });
    expect(freeSpecials(s.world.state, BASE)).toBe(0);
  });

  it('a native edition refuses an edition card', () => {
    const s = setup({ [LEG]: 1 });
    s.world.state.editionCards.brillante = 1;
    const b = s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    expect(editionCheck(s.world.state, b, 'brillante')).toBe('native');
    expect(applyEdition(s.world, b, 'brillante')).toBe(false);
    s.tools.setTool('edition');
    s.tools.setEditionVariant('brillante');
    click(s, 20, 20);
    expect(s.errors).toBe(1);
    expect(b.edition).toBe('legendaire');
  });

  it('paste: with its native edition while a copy is free, else blocked like an occupied tile', () => {
    const s = setup({ [LEG]: 2 });
    s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    const clip = copyArea(s.world, selectionRect({ x: 20, y: 20 }, { x: 21, y: 21 }));
    if (!clip) throw new Error('nothing copied');
    // One copy left: a row of three pastes one, the others are blocked.
    const row = planPasteRow(s.world, clip, { x: 30, y: 30 }, { x: 35, y: 30 });
    expect(row.map((p) => p.buildings[0]?.ok)).toEqual([true, false, false]);
    expect(row[0]?.buildings[0]).toMatchObject({ edition: 'legendaire' });
    const n = s.tools.history.run(() => row.reduce((k, p) => k + applyPaste(s.world, p), 0));
    expect(n).toBe(1);
    expect(s.world.buildingAt(30, 30)).toMatchObject({ edition: 'legendaire' });
    expect(freeSpecials(s.world.state, LEG)).toBe(0);
    // None left: blocked, and the paste tool shows it in red.
    expect(planPaste(s.world, clip, 40, 40).buildings[0]?.ok).toBe(false);
    s.world.state.clipboard.unshift(clip);
    s.tools.setTool('paste');
    s.tools.pointerMove(41, 41, NO_MODS);
    expect(s.tools.ghost().buildings).toMatchObject([{ ok: false }]);
    click(s, 41, 41);
    expect(s.errors).toBe(1);
  });

  it('move keeps everything; the inventory does not change', () => {
    const s = setup({ [LEG]: 1 });
    const b = s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    const plan = planMove(s.world, b.id, 30, 30, 1);
    if (!plan) throw new Error('cannot move');
    s.tools.history.run(() => applyMove(s.world, plan));
    expect(s.world.buildingAt(30, 30)).toMatchObject({ id: b.id, edition: 'legendaire', rot: 1 });
    expect(freeSpecials(s.world.state, LEG)).toBe(0);
    s.tools.undo();
    expect(s.world.buildingAt(20, 20)).toMatchObject({ id: b.id, edition: 'legendaire' });
  });

  it('undo of a demolition: restored while a copy is free, skipped otherwise', () => {
    const s = setup({ [LEG]: 1 });
    const b = s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    s.tools.history.run(() => demolishAt(s.world, 20, 20));
    s.tools.undo();
    expect(s.world.state.buildings.get(b.id)).toMatchObject({ edition: 'legendaire' });
    s.tools.redo();
    // The copy is placed elsewhere outside the history: undoing can no longer bring it back.
    s.world.addBuilding('ancientAdder', 40, 40, 0, { native: 'legendaire' });
    expect(s.tools.undo()).toBe(true);
    expect(s.world.state.buildings.has(b.id)).toBe(false);
    expect(s.world.buildingAt(20, 20)).toBeNull();
    expect(specials(s.world)).toHaveLength(1);
    expect(freeSpecials(s.world.state, LEG)).toBe(0);
  });

  it('the pipette takes the tool with the native edition (an applied one stays behind)', () => {
    const s = setup({ [LEG]: 2, [BASE]: 1 });
    s.world.state.editionCards.brillante = 1;
    s.world.addBuilding('ancientAdder', 20, 20, 1, { native: 'legendaire' });
    const plain = s.world.addBuilding('ancientAdder', 30, 20, 0);
    applyEdition(s.world, plain, 'brillante');
    s.tools.pointerMove(20, 20, NO_MODS);
    expect(s.tools.pick()).toBe(true);
    expect(s.tools.tool).toBe('ancientAdder');
    expect(s.tools.rot).toBe(1);
    expect(s.tools.specialVariant('ancientAdder')).toBe('legendaire');
    s.tools.setTool('none');
    s.tools.pointerMove(30, 20, NO_MODS);
    expect(s.tools.pick()).toBe(true);
    expect(s.tools.specialVariant('ancientAdder')).toBe('base');
  });
});

describe('special buildings in the save', () => {
  function world(): World {
    const s = setup({ [LEG]: 1, [BASE]: 2 });
    s.world.state.editionCards.brillante = 1;
    s.world.addBuilding('ancientAdder', 20, 20, 0, { native: 'legendaire' });
    const plain = s.world.addBuilding('ancientAdder', 30, 20, 0);
    applyEdition(s.world, plain, 'brillante');
    s.tools.copyRect(selectionRect({ x: 20, y: 20 }, { x: 21, y: 21 }), false);
    return s.world;
  }

  it('round trip keeps placed specials, native and applied editions, and the clip', () => {
    const w = world();
    const cam = { x: 0, y: 0, zoom: 1 };
    const data = validateSave(JSON.parse(JSON.stringify(serialize(w, cam))));
    const { state } = deserialize(data);
    const back = new World(state, new DepositMap(state.seed));
    expect(stateHash(back, cam)).toBe(stateHash(w, cam));
    expect(back.buildingAt(20, 20)).toMatchObject({ type: 'ancientAdder', edition: 'legendaire' });
    expect(back.buildingAt(20, 20)?.editionApplied).toBeUndefined();
    expect(back.buildingAt(30, 20)).toMatchObject({ edition: 'brillante', editionApplied: true });
    expect(freeSpecials(state, LEG)).toBe(0);
    expect(freeSpecials(state, BASE)).toBe(1);
    expect(state.clipboard[0]?.buildings[0]).toMatchObject({ edition: 'legendaire' });
  });

  it('rejects a native edition on an ordinary building, more placed than obtained', () => {
    const good = serialize(world(), { x: 0, y: 0, zoom: 1 });
    expect(() => validateSave(structuredClone(good))).not.toThrow();
    // A valid extra copy: one more obtained.
    const special = good.buildings.find((b) => b.type === 'ancientAdder' && !b.editionApplied);
    if (!special) throw new Error('no special');
    const copy = (): typeof special => structuredClone(special);
    const more = structuredClone(good);
    more.nextBuildingId = 100;
    more.specials[LEG] = 2;
    more.buildings.push({ ...copy(), id: 99, x: 50 });
    expect(() => validateSave(more)).not.toThrow();
    const bad = (edit: (d: typeof good) => void): unknown => {
      const d = structuredClone(good);
      d.nextBuildingId = 100;
      edit(d);
      return d;
    };
    const cases: unknown[] = [
      // A native edition on an ordinary building.
      bad((d) => d.buildings.push({ ...copy(), id: 99, type: 'adder', x: 50 })),
      // More placed than obtained (legendary: 1 obtained, 1 placed).
      bad((d) => (d.specials[LEG] = 0)),
      bad((d) => d.buildings.push({ ...copy(), id: 99, x: 50 })),
      // An unknown key or a bad count.
      bad((d) => (d.specials['adder:base'] = 1)),
      bad((d) => (d.specials[BASE] = -1)),
      // A clip edition on an ordinary building.
      bad((d) => Object.assign(d.clipboard[0]?.buildings[0] ?? {}, { type: 'adder' })),
      bad((d) => Object.assign(d.clipboard[0]?.buildings[0] ?? {}, { edition: 'gold' })),
    ];
    for (const c of cases) expect(() => validateSave(c)).toThrow(SaveError);
  });
});
