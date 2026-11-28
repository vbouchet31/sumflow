import { describe, expect, it } from 'vitest';
import { PASSIVE_EFFECTS } from '../../src/config/cards';
import { decodeSave, encodeSave, encodeSaveSync, importSave } from '../../src/save/persist';
import { SAVE_VERSION, SaveError } from '../../src/save/schema';
import { deserialize, serialize, stateHash } from '../../src/save/serialize';
import {
  autoPickIndex,
  DEFAULT_PICK_MODE,
  parsePickMode,
  resolvePending,
} from '../../src/sim/autoPick';
import { ensureLevels } from '../../src/sim/levels';
import { drawOffer, naturalAt } from '../../src/sim/offers';
import { cycleDuration } from '../../src/sim/operators';
import {
  chooseCard,
  completeLevel,
  deliver,
  type Emit,
  ensureOffer,
  levelPaliers,
  type ProgressionEvents,
  setLevel,
} from '../../src/sim/progression';
import { grantCard, offerContext } from '../../src/sim/rewards';
import { createInitialState, type GameState } from '../../src/sim/state';
import { World } from '../../src/sim/world';
import { DepositMap } from '../../src/world/chunks';

const CAM = { x: 0, y: 0, zoom: 1 };

type Event = {
  [K in keyof ProgressionEvents]: { type: K; payload: ProgressionEvents[K] };
}[keyof ProgressionEvents];

function recorder(): { events: Event[]; emit: Emit } {
  const events: Event[] = [];
  const emit: Emit = (type, payload) => events.push({ type, payload } as Event);
  return { events, emit };
}

/** A game at level 3 with the rewards of levels 1 and 2. */
function atLevel3(seed = 42): GameState {
  const s = createInitialState(seed);
  completeLevel(s);
  completeLevel(s);
  return s;
}

/** Replace the current offer (first pending palier, palier 1 of this level if none). */
function force(s: GameState, ...cards: GameState['picks'][number]['card'][]): void {
  if (s.pendingOffers.length === 0) s.pendingOffers.push({ level: s.level, palier: 1 });
  const next = s.pendingOffers[0] ?? { level: s.level, palier: 1 };
  s.currentOffer = {
    ...next,
    cards: cards.map((card) => ({
      card,
      edition: card === 'edition-legendaire' ? 'legendaire' : 'base',
    })),
  };
}

/** Deliver `count` items of the current target. */
function feed(s: GameState, count: number, emit?: Emit): void {
  for (let i = 0; i < count; i++) deliver(s, s.levelRequirement?.value ?? 0, emit);
}

function reload(s: GameState): GameState {
  return deserialize(serialize(new World(s, new DepositMap(s.seed)), CAM)).state;
}

describe('level rewards: the fil rouge, given at once (PLAN-paliers §3.1)', () => {
  it('levels 1, 2 and 3 give the adder, upgrades and value 2 at once', () => {
    const s = createInitialState(42);
    const { events, emit } = recorder();
    completeLevel(s, emit);
    completeLevel(s, emit);
    completeLevel(s, emit);
    expect(s.unlockedBuildings).toContain('adder');
    expect(s.unlockedFeatures).toContain('upgrades');
    expect(s.maxExtraction).toBe(2);
    expect(s.pendingOffers).toEqual([]);
    expect(s.currentOffer).toBeNull();
    expect(s.picks.map((p) => [p.level, p.card, p.edition, p.palier])).toEqual([
      [1, 'adder', 'base', undefined],
      [2, 'upgrades', 'base', undefined],
      [3, 'value', 'base', undefined],
    ]);
    expect(events).toEqual([
      {
        type: 'levelCompleted',
        payload: { level: 1, reward: { card: 'adder', edition: 'base' }, final: false },
      },
      {
        type: 'levelCompleted',
        payload: { level: 2, reward: { card: 'upgrades', edition: 'base' }, final: false },
      },
      {
        type: 'levelCompleted',
        payload: { level: 3, reward: { card: 'value', edition: 'base', value: 2 }, final: false },
      },
    ]);
  });

  it('an item already owned is skipped: the level gives the next one, never twice', () => {
    const s = atLevel3();
    grantCard(s, 'value'); // value 2 before level 3
    completeLevel(s);
    expect(s.maxExtraction).toBe(2);
    expect(s.unlockedBuildings).toContain('bridge');
    expect(s.picks.at(-1)).toMatchObject({ level: 3, card: 'bridge' });
  });
});

describe('paliers and the queue of offers (PLAN-paliers §3.2)', () => {
  it('no palier before level 6', () => {
    const s = createInitialState(42);
    setLevel(s, 5);
    expect(levelPaliers(s)).toEqual([]);
    feed(s, s.levelRequirement?.required ?? 0);
    expect(s.level).toBe(6);
    expect(s.pendingOffers).toEqual([]);
  });

  it('level 6: half the quantity queues one offer, the end gives the fil rouge', () => {
    const s = createInitialState(42);
    setLevel(s, 6);
    const required = s.levelRequirement?.required ?? 0;
    expect(levelPaliers(s)).toEqual([Math.ceil(required / 2)]);
    const { events, emit } = recorder();
    feed(s, Math.ceil(required / 2) - 1, emit);
    expect(s.pendingOffers).toEqual([]);
    feed(s, 1, emit);
    expect(s.pendingOffers).toEqual([{ level: 6, palier: 1 }]);
    expect(events.filter((e) => e.type !== 'delivered')).toEqual([
      { type: 'palierReached', payload: { level: 6, palier: 1, of: 1, pending: 1 } },
    ]);
    feed(s, required - Math.ceil(required / 2), emit);
    expect(s.level).toBe(7);
    expect(s.pendingOffers).toEqual([{ level: 6, palier: 1 }]);
    expect(events.at(-1)).toMatchObject({ type: 'levelCompleted', payload: { level: 6 } });
  });

  it('three paliers from level 16, at a quarter, half and three quarters', () => {
    const s = createInitialState(42);
    setLevel(s, 16);
    const required = s.levelRequirement?.required ?? 0;
    expect(required).toBe(3_000);
    expect(levelPaliers(s)).toEqual([750, 1_500, 2_250]);
    feed(s, required);
    expect(s.pendingOffers).toEqual([1, 2, 3].map((palier) => ({ level: 16, palier })));
  });

  it('an item that reaches a palier and ends the level queues the offer first', () => {
    const s = createInitialState(42);
    setLevel(s, 6);
    if (s.levelRequirement) s.levelRequirement.required = 1;
    const { events, emit } = recorder();
    feed(s, 1, emit);
    expect(events.map((e) => e.type)).toEqual(['delivered', 'palierReached', 'levelCompleted']);
    expect(s.pendingOffers).toEqual([{ level: 6, palier: 1 }]);
    expect(s.level).toBe(7);
  });

  it('ensureOffer draws once, stores the offer and keeps it', () => {
    const s = createInitialState(42);
    setLevel(s, 12);
    feed(s, s.levelRequirement?.required ?? 0);
    expect(s.pendingOffers).toHaveLength(2);
    const { events, emit } = recorder();
    const offer = ensureOffer(s, emit);
    expect(offer).toMatchObject({ level: 12, palier: 1 });
    expect(offer?.cards).toEqual(drawOffer(offerContext(s, 12, 1)).cards);
    expect(s.currentOffer).toBe(offer);
    expect(ensureOffer(s, emit)).toBe(offer);
    expect(events.filter((e) => e.type === 'offerReady')).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ level: 12, palier: 1, cards: offer?.cards, pending: 2 });
    expect(ensureOffer(createInitialState(1))).toBeNull();
  });

  it('every palier of a level draws its own cards', () => {
    let differ = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createInitialState(seed);
      setLevel(s, 16);
      const a = drawOffer(offerContext(s, 16, 1)).cards;
      const b = drawOffer(offerContext(s, 16, 2)).cards;
      if (JSON.stringify(a) !== JSON.stringify(b)) differ += 1;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('a reload keeps the pending offers and the stored offer', () => {
    const s = createInitialState(42);
    setLevel(s, 12);
    feed(s, s.levelRequirement?.required ?? 0);
    force(s, 'edition-legendaire', 'bridge'); // not what the draw would give
    const back = reload(s);
    expect(back.pendingOffers).toEqual([
      { level: 12, palier: 1 },
      { level: 12, palier: 2 },
    ]);
    expect(back.currentOffer).toEqual(s.currentOffer);
    expect(ensureOffer(back)?.cards).toEqual(s.currentOffer?.cards);
  });

  it('several pending offers are resolved in order, each drawn after the previous choice', () => {
    const s = createInitialState(7);
    setLevel(s, 12);
    feed(s, s.levelRequirement?.required ?? 0);
    // The first offer exists, the second is not drawn yet.
    force(s, 'eventail', 'edition-brillante');
    const { events, emit } = recorder();
    expect(chooseCard(s, 0, emit)).toBe(true);
    expect(s.pendingOffers).toEqual([{ level: 12, palier: 2 }]);
    expect(s.currentOffer).toBeNull();
    const second = ensureOffer(s, emit);
    expect(second).toMatchObject({ level: 12, palier: 2 });
    expect(second?.cards).toEqual(drawOffer(offerContext(s, 12, 2)).cards);
    // Éventail, taken just before, can no longer be offered, and widens this offer.
    expect(second?.cards.map((c) => c.card)).not.toContain('eventail');
    expect(second?.cards).toHaveLength(3);
    expect(chooseCard(s, 0, emit)).toBe(true);
    expect(s.pendingOffers).toEqual([]);
    expect(
      events.map((e) => [
        e.type,
        'level' in e.payload && e.payload.level,
        'palier' in e.payload && e.payload.palier,
      ]),
    ).toEqual([
      ['cardChosen', 12, 1],
      ['offerReady', 12, 2],
      ['cardChosen', 12, 2],
    ]);
    expect(s.picks.slice(-2).map((p) => [p.level, p.palier])).toEqual([
      [12, 1],
      [12, 2],
    ]);
  });

  it('drawing an offer moves the safety net on: Éventail comes within 5 offers', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createInitialState(seed);
      setLevel(s, 9);
      let wait = 0;
      for (let palier = 1; palier <= 5 && !s.picks.some((p) => p.card === 'eventail'); palier++) {
        s.pendingOffers.push({ level: 9, palier });
        const offer = ensureOffer(s);
        const i = offer?.cards.findIndex((c) => c.card === 'eventail') ?? -1;
        if (i >= 0) {
          expect(s.pity['eventail']).toBe(0);
          chooseCard(s, i);
        } else {
          wait += 1;
          expect(s.pity['eventail']).toBe(wait);
          chooseCard(s, 0);
        }
      }
      expect(s.picks.some((p) => p.card === 'eventail')).toBe(true);
    }
  });

  it('chooseCard refuses a missing card and needs a pending offer', () => {
    const s = atLevel3();
    expect(chooseCard(s, 0)).toBe(false);
    s.pendingOffers.push({ level: 3, palier: 1 });
    expect(chooseCard(s, 9)).toBe(false);
    expect(s.pendingOffers).toEqual([{ level: 3, palier: 1 }]);
  });
});

describe('card effects', () => {
  it('value: the next value, one by one, 9 then 11', () => {
    const s = atLevel3();
    force(s, 'value');
    const { events, emit } = recorder();
    chooseCard(s, 0, emit);
    expect(s.maxExtraction).toBe(2);
    expect(s.picks.at(-1)).toMatchObject({
      level: 3,
      palier: 1,
      card: 'value',
      edition: 'base',
      value: 2,
    });
    expect(events[0]).toEqual({
      type: 'cardChosen',
      payload: { level: 3, palier: 1, card: 'value', edition: 'base', value: 2, final: false },
    });
    s.maxExtraction = 9;
    grantCard(s, 'value');
    expect(s.maxExtraction).toBe(11);
  });

  it('unlock and feature: the building or feature, once', () => {
    const s = atLevel3();
    force(s, 'bridge');
    chooseCard(s, 0);
    force(s, 'priorities');
    chooseCard(s, 0);
    expect(s.unlockedBuildings.filter((b) => b === 'bridge')).toHaveLength(1);
    expect(s.unlockedFeatures).toContain('priorities');
    grantCard(s, 'bridge');
    expect(s.unlockedBuildings.filter((b) => b === 'bridge')).toHaveLength(1);
  });

  it('edition: one more edition card of that edition', () => {
    const s = atLevel3();
    force(s, 'edition-legendaire');
    chooseCard(s, 0);
    expect(s.editionCards).toEqual({ brillante: 0, legendaire: 1 });
    grantCard(s, 'edition-brillante', 'legendaire'); // the card's own edition wins
    expect(s.editionCards).toEqual({ brillante: 1, legendaire: 1 });
  });

  it('special: N buildings of the drawn native edition', () => {
    const s = atLevel3();
    s.pendingOffers = [{ level: 3, palier: 1 }];
    s.currentOffer = {
      level: 3,
      palier: 1,
      cards: [{ card: 'concat', edition: 'brillante' }],
    };
    chooseCard(s, 0);
    grantCard(s, 'concat', 'brillante');
    grantCard(s, 'concat');
    expect(s.specials).toEqual({ 'concat:brillante': 2, 'concat:base': 1 });
    expect(s.picks.at(-3)).toMatchObject({ card: 'concat', edition: 'brillante' });
  });

  it('passive: operators go faster', () => {
    const world = new World(atLevel3(), new DepositMap(42));
    const before = cycleDuration(world, { type: 'adder' });
    world.state.passives.push('operatorsBoost'); // no passive card for now
    expect(world.state.passives).toEqual(['operatorsBoost']);
    expect(cycleDuration(world, { type: 'adder' })).toBeCloseTo(
      before / PASSIVE_EFFECTS.operatorsBoost.operatorSpeed,
    );
  });

  it('meta: Éventail adds a third card to the next offers', () => {
    const s = createInitialState(42);
    setLevel(s, 8);
    force(s, 'eventail');
    chooseCard(s, 0);
    s.pendingOffers.push({ level: 8, palier: 1 });
    expect(ensureOffer(s)?.cards).toHaveLength(3);
  });
});

/**
 * State after each level when the natural card is always taken, from today's LEVEL_TABLE:
 * [level, maxExtraction, unlocked buildings, unlocked features].
 */
const NATURAL_TABLE: [number, number, string, string][] = [
  [1, 1, 'extractor adder', ''],
  [2, 1, 'extractor adder', 'upgrades'],
  [3, 2, 'extractor adder', 'upgrades'],
  [4, 2, 'extractor adder bridge', 'upgrades'],
  [5, 3, 'extractor adder bridge', 'upgrades'],
  [6, 4, 'extractor adder bridge', 'upgrades'],
  [7, 4, 'extractor adder bridge multiplier', 'upgrades'],
  [8, 5, 'extractor adder bridge multiplier', 'upgrades'],
  [9, 6, 'extractor adder bridge multiplier', 'upgrades'],
  [10, 6, 'extractor adder bridge multiplier', 'upgrades priorities'],
  [11, 7, 'extractor adder bridge multiplier', 'upgrades priorities'],
  [12, 8, 'extractor adder bridge multiplier', 'upgrades priorities'],
  [13, 8, 'extractor adder bridge multiplier subtractor', 'upgrades priorities'],
  [14, 9, 'extractor adder bridge multiplier subtractor', 'upgrades priorities'],
  [15, 11, 'extractor adder bridge multiplier subtractor', 'upgrades priorities'],
  [16, 11, 'extractor adder bridge multiplier subtractor divider', 'upgrades priorities'],
  [17, 12, 'extractor adder bridge multiplier subtractor divider', 'upgrades priorities'],
  [18, 13, 'extractor adder bridge multiplier subtractor divider', 'upgrades priorities'],
  [19, 13, 'extractor adder bridge multiplier subtractor divider exponent', 'upgrades priorities'],
  [20, 14, 'extractor adder bridge multiplier subtractor divider exponent', 'upgrades priorities'],
  [21, 15, 'extractor adder bridge multiplier subtractor divider exponent', 'upgrades priorities'],
  [
    22,
    15,
    'extractor adder bridge multiplier subtractor divider exponent storage',
    'upgrades priorities',
  ],
];
const ALL = 'extractor adder bridge multiplier subtractor divider exponent storage';
for (let n = 23; n <= 30; n++) NATURAL_TABLE.push([n, n - 7, ALL, 'upgrades priorities']);

describe('the fil rouge, followed from level 1 to 30', () => {
  it('reproduces the former fixed rewards exactly, without any choice', () => {
    for (const seed of [42, 7, 2024]) {
      const s = createInitialState(seed);
      for (const [level, max, buildings, features] of NATURAL_TABLE) {
        expect(s.level).toBe(level);
        completeLevel(s);
        expect([
          level,
          s.maxExtraction,
          s.unlockedBuildings.join(' '),
          s.unlockedFeatures.join(' '),
        ]).toEqual([level, max, buildings, features]);
      }
      expect(s.picks).toHaveLength(30);
      expect(s.pendingOffers).toEqual([]);
    }
  });

  it('setLevel grants the same fil rouge cards and drops the pending offers', () => {
    const s = atLevel3();
    s.pendingOffers.push({ level: 3, palier: 1 });
    ensureOffer(s);
    setLevel(s, 23);
    expect(s.pendingOffers).toEqual([]);
    expect(s.currentOffer).toBeNull();
    const row = NATURAL_TABLE[21];
    expect([s.maxExtraction, s.unlockedBuildings.join(' '), s.unlockedFeatures.join(' ')]).toEqual([
      row?.[1],
      row?.[2],
      row?.[3],
    ]);
    expect(s.picks.map((p) => p.level)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    setLevel(s, 23); // idempotent
    expect(s.picks).toHaveLength(22);
  });
});

describe('infinite and final levels', () => {
  it('infinite levels give the next value at once', () => {
    const s = createInitialState(42);
    setLevel(s, 31);
    expect(s.maxExtraction).toBe(23);
    expect(naturalAt(offerContext(s, 31))).toEqual({ card: 'value', value: 24 });
    completeLevel(s);
    expect(s.maxExtraction).toBe(24);
    expect(s.pendingOffers).toEqual([]);
    setLevel(s, 41);
    expect(s.maxExtraction).toBe(33);
  });

  it('the final level gives its reward; the game ends once no offer waits', () => {
    const s = createInitialState(5);
    const levels = ensureLevels(s.seed, s.levels, 5000);
    setLevel(s, levels.length);
    s.pendingOffers.push({ level: levels.length, palier: 1 });
    const { events, emit } = recorder();
    completeLevel(s, emit);
    expect(s.levelRequirement).toBeNull();
    expect(s.finishedAtTick).toBe(s.tick);
    expect(events[0]).toMatchObject({ type: 'levelCompleted', payload: { final: true } });
    expect(resolvePending(s, 'first', emit)).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['levelCompleted', 'offerReady', 'cardChosen']);
    expect(events.at(-1)?.payload).toMatchObject({ level: levels.length, final: true });
  });

  it('a palier chosen before the end is not final', () => {
    const s = atLevel3();
    force(s, 'edition-brillante');
    const { events, emit } = recorder();
    chooseCard(s, 0, emit);
    expect(events[0]?.payload).toMatchObject({ final: false });
  });
});

describe('automatic choice (?pick=)', () => {
  it('parses the mode; without one, the player chooses on the screen', () => {
    expect(DEFAULT_PICK_MODE).toBe('none');
    expect(parsePickMode(null)).toBe('none');
    expect(parsePickMode('bogus')).toBe('none');
    expect(parsePickMode('natural')).toBe('none'); // gone with the fil rouge offers
    expect(parsePickMode('first')).toBe('first');
    expect(parsePickMode('random')).toBe('random');
    expect(parsePickMode('none')).toBe('none');
  });

  it('first, random and none', () => {
    const s = atLevel3();
    force(s, 'bridge', 'edition-brillante');
    const offer = s.currentOffer;
    if (!offer) throw new Error('no offer');
    expect(autoPickIndex(s, offer, 'first')).toBe(0);
    expect(autoPickIndex(s, offer, 'none')).toBeNull();
    const r = autoPickIndex(s, offer, 'random');
    expect([0, 1]).toContain(r);
    expect(autoPickIndex(s, offer, 'random')).toBe(r); // seeded
    expect(resolvePending(s, 'none')).toBe(0);
    s.pendingOffers.push({ level: 3, palier: 2 });
    expect(resolvePending(s, 'random')).toBe(2);
    expect(s.pendingOffers).toEqual([]);
  });
});

describe('save version 3', () => {
  function rich(): GameState {
    const s = atLevel3();
    grantCard(s, 'edition-brillante');
    grantCard(s, 'edition-legendaire');
    grantCard(s, 'concat', 'legendaire');
    s.passives.push('operatorsBoost');
    grantCard(s, 'eventail');
    grantCard(s, 'value');
    s.pendingOffers.push({ level: 3, palier: 1 }, { level: 3, palier: 2 });
    ensureOffer(s);
    chooseCard(s, 0);
    s.pendingOffers.push({ level: 3, palier: 3 });
    ensureOffer(s);
    s.pity = { 'eventail-2': 3 };
    return s;
  }

  it('round-trips every new field', async () => {
    const s = rich();
    const world = new World(s, new DepositMap(s.seed));
    const data = serialize(world, CAM);
    expect(data.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    for (const text of [await encodeSave(data), encodeSaveSync(data)]) {
      const back = deserialize(await decodeSave(text)).state;
      expect(back.picks).toEqual(s.picks);
      expect(back.picks.at(-1)?.palier).toBe(1);
      expect(back.pendingOffers).toEqual([
        { level: 3, palier: 2 },
        { level: 3, palier: 3 },
      ]);
      expect(back.currentOffer).toEqual(s.currentOffer);
      // Éventail asks for 3 cards; at level 3 only the two editions are available.
      expect(back.currentOffer?.cards).toHaveLength(2);
      expect(back.editionCards).toEqual(s.editionCards);
      expect(back.specials).toEqual(s.specials);
      expect(back.specials['concat:legendaire']).toBe(1);
      expect(back.passives).toEqual(s.passives);
      expect(back.passives).toContain('operatorsBoost');
      expect(back.pity).toEqual({ 'eventail-2': 3 });
      expect(stateHash(new World(back, new DepositMap(back.seed)), CAM)).toBe(
        stateHash(world, CAM),
      );
    }
  });

  it('rejects inconsistent reward data', async () => {
    const base = (): Record<string, unknown> =>
      JSON.parse(JSON.stringify(serialize(new World(rich(), new DepositMap(42)), CAM))) as Record<
        string,
        unknown
      >;
    const cases: ((d: Record<string, unknown>) => void)[] = [
      (d) => Object.assign((d['picks'] as object[])[0] ?? {}, { card: 'teleporter' }),
      (d) => Object.assign((d['picks'] as object[])[0] ?? {}, { edition: 'gold' }),
      (d) => Object.assign((d['picks'] as object[])[0] ?? {}, { palier: 0 }),
      (d) =>
        (d['pendingOffers'] = [
          { level: 3, palier: 3 },
          { level: 3, palier: 2 },
        ]),
      (d) => (d['pendingOffers'] = [{ level: 99, palier: 1 }]),
      (d) => (d['pendingOffers'] = [{ level: 3, palier: 0 }]),
      (d) => (d['pendingOffers'] = [3]),
      (d) => Object.assign(d['currentOffer'] ?? {}, { palier: 3 }),
      (d) => Object.assign(d['currentOffer'] ?? {}, { level: 2 }),
      (d) => (d['specials'] = { 'adder:base': 1 }),
      (d) => (d['editionCards'] = { brillante: -1, legendaire: 0 }),
      (d) => (d['passives'] = ['nope']),
      (d) => delete d['pendingOffers'],
      (d) => (d['pity'] = { nope: 1 }),
      (d) => (d['pity'] = { eventail: -1 }),
    ];
    for (const mutate of cases) {
      const d = base();
      mutate(d);
      await expect(decodeSave(JSON.stringify(d))).rejects.toBeInstanceOf(SaveError);
    }
  });

  it('refuses version 1 and 2 saves cleanly, as outdated', async () => {
    for (const version of [1, 2]) {
      const d = JSON.parse(
        JSON.stringify(serialize(new World(atLevel3(), new DepositMap(42)), CAM)),
      ) as Record<string, unknown>;
      d['version'] = version;
      const error = await decodeSave(JSON.stringify(d)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).reason).toBe('outdated');
      await expect(importSave(JSON.stringify(d))).rejects.toMatchObject({ reason: 'outdated' });
    }
    // A broken save keeps its own reason.
    const broken = await decodeSave('{"version":3}').catch((e: unknown) => e);
    expect((broken as SaveError).reason).toBe('invalid');
  });
});
