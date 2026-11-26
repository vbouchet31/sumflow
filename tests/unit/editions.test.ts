import { describe, expect, it } from 'vitest';
import { demolishArea, selectionRect } from '../../src/build/area';
import { applyPaste, copyArea, planPaste } from '../../src/build/clipboard';
import { applyMove, planMove } from '../../src/build/move';
import { applyBuildingPlan, demolishAt, planExtractor } from '../../src/build/placement';
import { ToolController } from '../../src/build/tools';
import { touchedBy } from '../../src/build/touched';
import { STORAGE_CAPACITY, TICK_DT } from '../../src/config/balance';
import { EDITION_RULES, type EditionRules } from '../../src/config/cards';
import { E } from '../../src/core/grid';
import { SaveError, validateSave } from '../../src/save/schema';
import { deserialize, serialize, stateHash } from '../../src/save/serialize';
import { storageCapacity, storeItem } from '../../src/sim/belts';
import { type Building, dirMask } from '../../src/sim/entities';
import { extractorRate } from '../../src/sim/extractor';
import {
  appliedEditions,
  applyEdition,
  canRemoveEdition,
  editionCheck,
  freeEditionCards,
  freeSpecials,
  removeEdition,
} from '../../src/sim/inventory';
import { cycleDuration } from '../../src/sim/operators';
import { runTicks } from '../../src/sim/tick';
import { currentExtractorRate } from '../../src/sim/upgrades';
import { World } from '../../src/sim/world';
import { DepositMap } from '../../src/world/chunks';
import { makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };
const PERMANENT: EditionRules = { returnOnDemolish: false, removable: false };

interface Setup {
  world: World;
  tools: ToolController;
  errors: number;
  built: number;
}

/** A world with every building unlocked, `brillante` and `legendaire` cards, and tools. */
function setup(cards = { brillante: 1, legendaire: 1 }, rules = EDITION_RULES): Setup {
  const world = makeWorld();
  world.editionRules = rules;
  world.state.unlockedBuildings.push(
    'adder',
    'multiplier',
    'subtractor',
    'divider',
    'exponent',
    'storage',
    'bridge',
  );
  world.state.editionCards = { ...cards };
  const s: Setup = { world, tools: null as unknown as ToolController, errors: 0, built: 0 };
  s.tools = new ToolController(world, {
    onError: () => s.errors++,
    onBuild: () => s.built++,
  });
  return s;
}

function free(world: World): { brillante: number; legendaire: number } {
  return {
    brillante: freeEditionCards(world.state, 'brillante'),
    legendaire: freeEditionCards(world.state, 'legendaire'),
  };
}

/** Click the Edition tool on tile (x, y) with `variant`. */
function click(s: Setup, x: number, y: number, variant: 'brillante' | 'legendaire'): void {
  if (s.tools.tool !== 'edition') s.tools.setTool('edition');
  s.tools.setEditionVariant(variant);
  s.tools.pointerDown(x, y, NO_MODS);
  s.tools.pointerUp(x, y, NO_MODS);
}

describe('edition cards: apply, swap, remove (default rules)', () => {
  it('the tool applies a free card; the building counts it, the card is no longer free', () => {
    const s = setup();
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    click(s, 21, 20, 'legendaire');
    expect(m.edition).toBe('legendaire');
    expect(m.editionApplied).toBe(true);
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 0 });
    expect(s.built).toBe(1);
    expect(s.errors).toBe(0);
    // Same edition again: nothing to do, and no card left anyway.
    click(s, 21, 20, 'legendaire');
    expect(s.errors).toBe(1);
  });

  it('a building with an applied edition swaps: the old card comes back', () => {
    const s = setup();
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    click(s, 20, 20, 'brillante');
    expect(free(s.world)).toEqual({ brillante: 0, legendaire: 1 });
    expect(editionCheck(s.world.state, m, 'legendaire')).toBe('swap');
    click(s, 20, 20, 'legendaire');
    expect(m.edition).toBe('legendaire');
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 0 });
  });

  it('"remove the edition" gives the card back and puts the building back to base', () => {
    const s = setup();
    const m = s.world.addBuilding('adder', 20, 20, 0);
    s.tools.select(20, 20);
    expect(s.tools.canEditionSelection('brillante')).toBe(true);
    expect(s.tools.canEditionSelection('legendaire')).toBe(true);
    expect(s.tools.canRemoveSelectionEdition).toBe(false);
    expect(s.tools.editionSelection('brillante')).toBe(true);
    expect(s.tools.canEditionSelection('brillante')).toBe(false);
    expect(s.tools.canRemoveSelectionEdition).toBe(true);
    expect(s.tools.removeSelectionEdition()).toBe(true);
    expect(m.edition).toBeUndefined();
    expect(m.editionApplied).toBeUndefined();
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 1 });
  });

  it('refuses the hub, a native edition, belts and bridges, and a missing card', () => {
    const s = setup({ brillante: 0, legendaire: 1 });
    const hub = s.world.state.buildings.get(0) as Building;
    expect(editionCheck(s.world.state, hub, 'legendaire')).toBe('unsupported');
    const special = s.world.addBuilding('adder', 20, 20, 0);
    special.edition = 'brillante'; // native edition (a special building, R6)
    expect(editionCheck(s.world.state, special, 'legendaire')).toBe('native');
    const m = s.world.addBuilding('multiplier', 30, 20, 0);
    expect(editionCheck(s.world.state, m, 'brillante')).toBe('noCard');

    click(s, 0, 0, 'legendaire'); // hub
    click(s, 20, 20, 'legendaire'); // native
    s.world.setBelt(25, 25, dirMask(E));
    s.world.setBridge(26, 25, E, null);
    click(s, 25, 25, 'legendaire');
    click(s, 26, 25, 'legendaire');
    click(s, 40, 40, 'legendaire'); // bare ground: nothing, no sound
    expect(s.errors).toBe(4);
    expect(hub.edition).toBeUndefined();
    expect(special.edition).toBe('brillante');
    expect(free(s.world).legendaire).toBe(1);
    // The ghost: the building in red; a belt in red.
    s.tools.pointerMove(20, 20, NO_MODS);
    expect(s.tools.ghost().buildings).toMatchObject([{ type: 'adder', ok: false }]);
    expect(s.tools.ghost().preview).toBeUndefined();
    s.tools.pointerMove(25, 25, NO_MODS);
    expect(s.tools.ghost().belts).toMatchObject([{ x: 25, y: 25, status: 'blocked' }]);
    // A building that can take it: drawn recoloured, the real one untouched.
    s.tools.pointerMove(31, 20, NO_MODS);
    const g = s.tools.ghost();
    expect(g.preview).toMatchObject({ id: m.id, edition: 'legendaire', editionApplied: true });
    expect(m.edition).toBeUndefined();
  });

  it('G picks the tool, then the other variant once both were obtained', () => {
    const s = setup({ brillante: 0, legendaire: 0 });
    expect(s.tools.isAvailable('edition')).toBe(false);
    expect(s.tools.editionKey()).toBe(false);
    s.world.state.editionCards.legendaire = 1;
    expect(s.tools.editionKey()).toBe(true);
    expect(s.tools.tool).toBe('edition');
    expect(s.tools.editionVariant).toBe('legendaire'); // the only one obtained
    expect(s.tools.editionKey()).toBe(true); // no other variant: the tool goes down
    expect(s.tools.tool).toBe('none');
    s.world.state.editionCards.brillante = 1;
    s.tools.editionKey();
    s.tools.editionKey();
    expect(s.tools.tool).toBe('edition');
    expect(s.tools.editionVariant).toBe('brillante');
  });
});

describe('edition cards: demolish, undo, redo (default rules)', () => {
  it('every way of demolishing frees the card', () => {
    const s = setup({ brillante: 4, legendaire: 0 });
    const ways: ((x: number, y: number) => void)[] = [
      (x, y) => s.tools.history.run(() => demolishAt(s.world, x, y)),
      (x, y) => s.tools.history.run(() => demolishArea(s.world, selectionRect({ x, y }, { x, y }))),
      (x, y) => s.tools.copyRect(selectionRect({ x, y }, { x, y }), true), // cut
      (x, y) => {
        s.tools.setTool('none');
        s.tools.select(x, y);
        s.tools.deleteSelection(); // bubble delete, Delete key on the selection
      },
    ];
    ways.forEach((demolish, i) => {
      const b = s.world.addBuilding('adder', 20 + 4 * i, 20, 0);
      s.tools.history.run(() => applyEdition(s.world, b, 'brillante'));
      expect(freeEditionCards(s.world.state, 'brillante')).toBe(3);
      demolish(20 + 4 * i, 20);
      expect(s.world.state.buildings.has(b.id)).toBe(false);
      expect(freeEditionCards(s.world.state, 'brillante')).toBe(4);
    });
  });

  it('apply, swap, remove and demolish undo and redo, with the counts', () => {
    const s = setup();
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    const steps: [() => void, ReturnType<typeof free>, string | undefined][] = [
      [() => click(s, 20, 20, 'brillante'), { brillante: 0, legendaire: 1 }, 'brillante'],
      [() => click(s, 20, 20, 'legendaire'), { brillante: 1, legendaire: 0 }, 'legendaire'],
      [
        () => s.tools.history.run(() => removeEdition(s.world, m)),
        { brillante: 1, legendaire: 1 },
        undefined,
      ],
    ];
    const seen: [ReturnType<typeof free>, string | undefined][] = [[free(s.world), m.edition]];
    for (const [act, counts, edition] of steps) {
      act();
      expect(free(s.world)).toEqual(counts);
      expect(m.edition).toBe(edition);
      seen.push([counts, edition]);
    }
    for (let i = seen.length - 2; i >= 0; i--) {
      expect(s.tools.undo()).toBe(true);
      expect([free(s.world), m.edition]).toEqual(seen[i]);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(s.tools.redo()).toBe(true);
      expect([free(s.world), m.edition]).toEqual(seen[i]);
    }
    // Demolish with an edition, undo: back with it; redo: gone, card free.
    click(s, 20, 20, 'legendaire');
    s.tools.history.run(() => demolishAt(s.world, 20, 20));
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 1 });
    s.tools.undo();
    expect(s.world.state.buildings.get(m.id)?.edition).toBe('legendaire');
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 0 });
    s.tools.redo();
    expect(free(s.world)).toEqual({ brillante: 1, legendaire: 1 });
  });

  it('undoing a demolition whose card was applied elsewhere brings the building back as base', () => {
    const s = setup({ brillante: 0, legendaire: 1 });
    const a = s.world.addBuilding('adder', 20, 20, 0);
    const m = s.world.addBuilding('multiplier', 30, 20, 0);
    s.tools.history.run(() => applyEdition(s.world, a, 'legendaire'));
    s.tools.history.run(() => demolishAt(s.world, 20, 20));
    // Not undone yet: the card goes on the multiplier (a new action clears the redo stack,
    // so apply it outside the history to keep the demolition undoable).
    applyEdition(s.world, m, 'legendaire');
    s.tools.undo();
    const back = s.world.state.buildings.get(a.id);
    expect(back).toBeDefined();
    expect(back?.edition).toBeUndefined();
    expect(m.edition).toBe('legendaire');
    expect(appliedEditions(s.world.state).legendaire).toBe(1);
    expect(free(s.world).legendaire).toBe(0);
    // Redo, then undo again once the card is free: the edition comes back too.
    s.tools.redo();
    removeEdition(s.world, m);
    s.tools.undo();
    expect(s.world.state.buildings.get(a.id)?.edition).toBe('legendaire');
  });

  it('paste never copies an applied edition; move keeps it; the pipette builds base', () => {
    const s = setup({ brillante: 0, legendaire: 1 });
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    applyEdition(s.world, m, 'legendaire');
    const clip = copyArea(s.world, selectionRect({ x: 20, y: 20 }, { x: 22, y: 20 }));
    expect(clip?.buildings[0]).not.toHaveProperty('edition');
    if (!clip) throw new Error('no clip');
    s.tools.history.run(() => applyPaste(s.world, planPaste(s.world, clip, 20, 24)));
    const pasted = s.world.buildingAt(20, 24);
    expect(pasted?.type).toBe('multiplier');
    expect(pasted?.edition).toBeUndefined();
    expect(free(s.world).legendaire).toBe(0);

    const plan = planMove(s.world, m.id, 20, 30, 1);
    if (!plan) throw new Error('no move plan');
    expect(s.tools.history.run(() => applyMove(s.world, plan))).toBe(true);
    expect(s.world.buildingAt(20, 30)?.edition).toBe('legendaire');
    expect(free(s.world).legendaire).toBe(0);
    s.tools.undo();
    expect(s.world.buildingAt(20, 20)?.edition).toBe('legendaire');
    expect(free(s.world).legendaire).toBe(0);

    s.tools.pointerMove(20, 20, NO_MODS);
    expect(s.tools.pick()).toBe(true);
    expect(s.tools.tool).toBe('multiplier');
    s.tools.pointerDown(20, 40, NO_MODS);
    s.tools.pointerUp(20, 40, NO_MODS);
    expect(s.world.buildingAt(20, 40)?.edition).toBeUndefined();
  });

  it('a change of edition is "placed" for the chalk dust, with the edition colour', () => {
    const s = setup();
    s.world.addBuilding('adder', 20, 20, 0);
    click(s, 20, 20, 'legendaire');
    expect(s.tools.history.lastTouched().placed).toMatchObject([
      { x: 20, y: 20, type: 'adder', edition: 'legendaire' },
    ]);
    s.tools.undo();
    expect(s.tools.history.lastTouched().placed).toHaveLength(1);
    // A priority change alone still touches nothing.
    const change = {
      tiles: new Map(),
      markers: new Map(),
      buildings: new Map([
        [
          1,
          {
            before: { ...snapOf(s.world, 1), priority: null },
            after: { ...snapOf(s.world, 1), priority: 5 },
          },
        ],
      ]),
    };
    expect(touchedBy(change, 'after').placed).toEqual([]);
  });
});

function snapOf(world: World, id: number) {
  const snap = world.buildingSnap(id);
  if (!snap) throw new Error('no building');
  return snap;
}

describe('permanent editions (EDITION_RULES false, false)', () => {
  it('a card is consumed when applied and lost on demolish; undo puts everything back', () => {
    const s = setup({ brillante: 0, legendaire: 1 }, PERMANENT);
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    click(s, 20, 20, 'legendaire');
    expect(free(s.world).legendaire).toBe(0);
    expect(canRemoveEdition(s.world, m)).toBe(false);
    expect(removeEdition(s.world, m)).toBe(false);
    s.tools.select(20, 20);
    s.tools.setTool('none');
    s.tools.select(20, 20);
    expect(s.tools.canRemoveSelectionEdition).toBe(false);

    s.tools.history.run(() => demolishAt(s.world, 20, 20));
    expect(s.world.state.editionsLost.legendaire).toBe(1);
    expect(free(s.world).legendaire).toBe(0); // lost, not given back

    // Undo the demolition: the building comes back with its edition, nothing counted twice.
    s.tools.undo();
    expect(s.world.state.buildings.get(m.id)?.edition).toBe('legendaire');
    expect(s.world.state.editionsLost.legendaire).toBe(0);
    expect(free(s.world).legendaire).toBe(0);
    // Undo the application: the card comes back (a misclick costs nothing).
    s.tools.undo();
    expect(s.world.state.buildings.get(m.id)?.edition).toBeUndefined();
    expect(free(s.world).legendaire).toBe(1);
    // Redo both: applied, then demolished and lost again.
    s.tools.redo();
    expect(free(s.world).legendaire).toBe(0);
    s.tools.redo();
    expect(s.world.state.buildings.has(m.id)).toBe(false);
    expect(s.world.state.editionsLost.legendaire).toBe(1);
    expect(free(s.world).legendaire).toBe(0);
  });

  it('a swap loses the old card; undoing it gives it back', () => {
    const s = setup({ brillante: 1, legendaire: 1 }, PERMANENT);
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    click(s, 20, 20, 'brillante');
    click(s, 20, 20, 'legendaire');
    expect(m.edition).toBe('legendaire');
    expect(s.world.state.editionsLost.brillante).toBe(1);
    expect(free(s.world)).toEqual({ brillante: 0, legendaire: 0 });
    s.tools.undo();
    expect(m.edition).toBe('brillante');
    expect(s.world.state.editionsLost.brillante).toBe(0);
    expect(free(s.world)).toEqual({ brillante: 0, legendaire: 1 });
  });

  it('a zone demolition loses every card on it, once', () => {
    const s = setup({ brillante: 2, legendaire: 0 }, PERMANENT);
    const a = s.world.addBuilding('adder', 20, 20, 0);
    const b = s.world.addBuilding('adder', 24, 20, 0);
    applyEdition(s.world, a, 'brillante');
    applyEdition(s.world, b, 'brillante');
    s.tools.history.run(() =>
      demolishArea(s.world, selectionRect({ x: 20, y: 20 }, { x: 26, y: 22 })),
    );
    expect(s.world.state.editionsLost.brillante).toBe(2);
    expect(free(s.world).brillante).toBe(0);
    s.tools.undo();
    expect(appliedEditions(s.world.state).brillante).toBe(2);
    expect(s.world.state.editionsLost.brillante).toBe(0);
    s.tools.redo();
    expect(s.world.state.editionsLost.brillante).toBe(2);
  });
});

describe('edition effects (provisional EDITION_EFFECTS)', () => {
  it('operators: speed × 1.25 / × 1.5 on top of upgrades and passives', () => {
    const s = setup();
    const base = cycleDuration(s.world, { type: 'adder' });
    expect(cycleDuration(s.world, { type: 'adder', edition: 'brillante' })).toBeCloseTo(
      base / 1.25,
      10,
    );
    s.world.state.passives.push('operatorsBoost');
    s.world.state.upgrades.adder = 3;
    const up = cycleDuration(s.world, { type: 'adder' });
    expect(up).toBeLessThan(base);
    expect(cycleDuration(s.world, { type: 'adder', edition: 'legendaire' })).toBeCloseTo(
      up / 1.5,
      10,
    );
  });

  it('operators: a légendaire adder fed constantly works 1.5 × as fast', () => {
    const s = setup({ brillante: 0, legendaire: 1 });
    const fast = s.world.addBuilding('adder', 20, 20, 0);
    const slow = s.world.addBuilding('adder', 30, 20, 0);
    applyEdition(s.world, fast, 'legendaire');
    let fastOps = 0;
    let slowOps = 0;
    for (let i = 0; i < 600; i++) {
      for (const b of [fast, slow]) {
        b.inA = [1];
        b.inB = [1];
        b.out = [];
      }
      runTicks(s.world, 1);
      if (fast.flashTick === s.world.state.tick) fastOps++;
      if (slow.flashTick === s.world.state.tick) slowOps++;
    }
    expect(fastOps / slowOps).toBeCloseTo(1.5, 1);
  });

  it('extractor: output × 1.5', () => {
    const s = setup({ brillante: 0, legendaire: 1 });
    s.world.state.maxExtraction = 9;
    const d = s.world.deposits.findNearest(2);
    if (!d) throw new Error('no deposit');
    const ex = applyBuildingPlan(s.world, planExtractor(s.world, d.x, d.y));
    if (!ex) throw new Error('no extractor');
    const rate = currentExtractorRate(s.world.state);
    expect(extractorRate(s.world, ex)).toBe(rate);
    applyEdition(s.world, ex, 'legendaire');
    expect(extractorRate(s.world, ex)).toBeCloseTo(rate * 1.5, 10);
    // Nowhere to push: the accumulator shows what one tick produced.
    ex.extractAcc = 0;
    runTicks(s.world, 1);
    expect(ex.extractAcc).toBeCloseTo(rate * 1.5 * TICK_DT, 10);
  });

  it('storage: capacity 12 500 brillante, 15 000 légendaire, displayed per building', () => {
    const s = setup({ brillante: 1, legendaire: 1 });
    const st = s.world.addBuilding('storage', 20, 20, 0);
    expect(storageCapacity(st)).toBe(STORAGE_CAPACITY);
    applyEdition(s.world, st, 'brillante');
    expect(storageCapacity(st)).toBe(12_500);
    st.storeValue = 3;
    st.storeCount = 12_499;
    expect(storeItem(st, 3)).toBe(true);
    expect(storeItem(st, 3)).toBe(false);
    applyEdition(s.world, st, 'legendaire');
    expect(storageCapacity(st)).toBe(15_000);
    expect(storeItem(st, 3)).toBe(true);
    // Back to base: nothing is destroyed, it only stops taking more.
    removeEdition(s.world, st);
    expect(st.storeCount).toBe(12_501);
    expect(storeItem(st, 3)).toBe(false);
  });
});

describe('special buildings inventory (data model)', () => {
  it('free = obtained − placed, by native edition', () => {
    const s = setup();
    s.world.state.specials['concat:legendaire'] = 2;
    expect(freeSpecials(s.world.state, 'concat:legendaire')).toBe(2);
    expect(freeSpecials(s.world.state, 'concat:base')).toBe(0);
  });
});

describe('save with editions', () => {
  function worldWithEditions(): World {
    const s = setup({ brillante: 2, legendaire: 1 });
    const m = s.world.addBuilding('multiplier', 20, 20, 0);
    const st = s.world.addBuilding('storage', 30, 20, 0);
    applyEdition(s.world, m, 'legendaire');
    applyEdition(s.world, st, 'brillante');
    s.world.state.editionsLost.brillante = 1;
    return s.world;
  }

  it('round trip keeps editions, applied flags and lost cards', () => {
    const world = worldWithEditions();
    const cam = { x: 0, y: 0, zoom: 1 };
    const data = validateSave(JSON.parse(JSON.stringify(serialize(world, cam))));
    const { state } = deserialize(data);
    const back = new World(state, new DepositMap(state.seed));
    expect(stateHash(back, cam)).toBe(stateHash(world, cam));
    expect(back.buildingAt(20, 20)).toMatchObject({ edition: 'legendaire', editionApplied: true });
    expect(state.editionsLost).toEqual({ brillante: 1, legendaire: 0 });
    expect(freeEditionCards(state, 'brillante')).toBe(0);
  });

  it('rejects bad edition data', () => {
    const world = worldWithEditions();
    const good = serialize(world, { x: 0, y: 0, zoom: 1 });
    const idx = good.buildings.findIndex((b) => b.type === 'multiplier');
    const hub = good.buildings.findIndex((b) => b.type === 'hub');
    const bad = (edit: (d: Record<string, unknown> & typeof good) => void): unknown => {
      const d = structuredClone(good);
      edit(d as Record<string, unknown> & typeof good);
      return d;
    };
    const cases: unknown[] = [
      bad((d) => Object.assign(d.buildings[idx] ?? {}, { edition: 'gold' })),
      bad((d) => Object.assign(d.buildings[idx] ?? {}, { editionApplied: false })),
      bad((d) => {
        const b = d.buildings[idx] as unknown as Record<string, unknown>;
        delete b['edition'];
      }),
      bad((d) =>
        Object.assign(d.buildings[hub] ?? {}, { edition: 'legendaire', editionApplied: true }),
      ),
      bad((d) => (d.editionCards.legendaire = 0)),
      bad((d) => (d.editionsLost = { brillante: 2, legendaire: 0 })),
      bad((d) => (d.editionsLost = { brillante: -1, legendaire: 0 })),
    ];
    for (const c of cases) expect(() => validateSave(c)).toThrow(SaveError);
    // Saves of version 2 written before R5 have no editionsLost: none lost.
    const old = structuredClone(good) as Partial<typeof good>;
    delete old.editionsLost;
    old.editionCards = { brillante: 1, legendaire: 1 };
    expect(validateSave(old).editionsLost).toEqual({ brillante: 0, legendaire: 0 });
  });
});
