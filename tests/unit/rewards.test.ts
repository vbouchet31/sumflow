import { describe, expect, it } from 'vitest';
import { PASSIVE_EFFECTS } from '../../src/config/cards';
import { decodeSave, encodeSave, encodeSaveSync, importSave } from '../../src/save/persist';
import { SAVE_VERSION, SaveError } from '../../src/save/schema';
import { deserialize, serialize, stateHash } from '../../src/save/serialize';
import { autoPickIndex, parsePickMode, resolvePending } from '../../src/sim/autoPick';
import { ensureLevels } from '../../src/sim/levels';
import { drawOffer, naturalAt } from '../../src/sim/offers';
import { cycleDuration } from '../../src/sim/operators';
import {
  chooseCard,
  completeLevel,
  type Emit,
  ensureOffer,
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

/** A game at level 3 with the fixed cards of levels 1 and 2. */
function atLevel3(seed = 42): GameState {
  const s = createInitialState(seed);
  completeLevel(s);
  completeLevel(s);
  return s;
}

/** Replace the current offer (pending level `level`) with these cards. */
function force(s: GameState, ...cards: GameState['picks'][number]['card'][]): void {
  if (s.pendingLevels.length === 0) s.pendingLevels.push(Math.max(1, s.level - 1));
  const level = s.pendingLevels[0] ?? 1;
  s.currentOffer = {
    level,
    cards: cards.map((card) => ({
      card,
      edition: card === 'edition-legendaire' ? 'legendaire' : 'base',
    })),
  };
}

function reload(s: GameState): GameState {
  return deserialize(serialize(new World(s, new DepositMap(s.seed)), CAM)).state;
}

describe('fixed levels and the queue of offers', () => {
  it('levels 1 and 2 give the adder, then upgrades, at once', () => {
    const s = createInitialState(42);
    const { events, emit } = recorder();
    completeLevel(s, emit);
    completeLevel(s, emit);
    expect(s.unlockedBuildings).toContain('adder');
    expect(s.unlockedFeatures).toContain('upgrades');
    expect(s.pendingLevels).toEqual([]);
    expect(s.picks.map((p) => [p.level, p.card, p.edition])).toEqual([
      [1, 'adder', 'base'],
      [2, 'upgrades', 'base'],
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
    ]);
  });

  it('level 3 queues an offer: no reward yet, the next level starts', () => {
    const s = atLevel3();
    const { events, emit } = recorder();
    completeLevel(s, emit);
    expect(s.level).toBe(4);
    expect(s.levelRequirement?.value).toBe(5);
    expect(s.maxExtraction).toBe(1);
    expect(s.pendingLevels).toEqual([3]);
    expect(s.currentOffer).toBeNull();
    expect(s.picks).toHaveLength(2);
    expect(events).toEqual([
      { type: 'levelCompleted', payload: { level: 3, reward: null, final: false } },
    ]);
  });

  it('ensureOffer draws once, stores the offer and keeps it', () => {
    const s = atLevel3();
    completeLevel(s);
    const { events, emit } = recorder();
    const offer = ensureOffer(s, emit);
    expect(offer).not.toBeNull();
    expect(offer?.level).toBe(3);
    expect(offer?.cards).toEqual(drawOffer(offerContext(s, 3)).cards);
    expect(s.currentOffer).toBe(offer);
    expect(ensureOffer(s, emit)).toBe(offer);
    expect(events.filter((e) => e.type === 'offerReady')).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ level: 3, cards: offer?.cards, pending: 1 });
    expect(ensureOffer(createInitialState(1))).toBeNull();
  });

  it('a reload keeps the pending levels and the stored offer', () => {
    const s = atLevel3();
    completeLevel(s);
    completeLevel(s);
    force(s, 'edition-legendaire', 'bridge'); // not what the draw would give
    const back = reload(s);
    expect(back.pendingLevels).toEqual([3, 4]);
    expect(back.currentOffer).toEqual(s.currentOffer);
    expect(ensureOffer(back)?.cards).toEqual(s.currentOffer?.cards);
  });

  it('several pending offers are resolved in order, each drawn after the previous choice', () => {
    const s = atLevel3(7);
    completeLevel(s);
    completeLevel(s);
    expect(s.pendingLevels).toEqual([3, 4]);
    // The first offer exists, the second is not drawn yet.
    force(s, 'bridge', 'value');
    const { events, emit } = recorder();
    expect(chooseCard(s, 0, emit)).toBe(true);
    expect(s.unlockedBuildings).toContain('bridge');
    expect(s.pendingLevels).toEqual([4]);
    expect(s.currentOffer).toBeNull();
    const second = ensureOffer(s, emit);
    expect(second?.level).toBe(4);
    expect(second?.cards).toEqual(drawOffer(offerContext(s, 4)).cards);
    // The bridge, taken just before, can no longer be offered.
    expect(second?.cards.map((c) => c.card)).not.toContain('bridge');
    expect(chooseCard(s, 0, emit)).toBe(true);
    expect(s.pendingLevels).toEqual([]);
    expect(events.map((e) => [e.type, 'level' in e.payload ? e.payload.level : null])).toEqual([
      ['cardChosen', 3],
      ['offerReady', 4],
      ['cardChosen', 4],
    ]);
    expect(s.picks.map((p) => p.level)).toEqual([1, 2, 3, 4]);
  });

  it('chooseCard refuses a missing card and needs a pending level', () => {
    const s = atLevel3();
    expect(chooseCard(s, 0)).toBe(false);
    completeLevel(s);
    expect(chooseCard(s, 9)).toBe(false);
    expect(s.pendingLevels).toEqual([3]);
  });
});

describe('card effects', () => {
  it('value: the next value, one by one, 9 then 11', () => {
    const s = atLevel3();
    completeLevel(s);
    force(s, 'value');
    const { events, emit } = recorder();
    chooseCard(s, 0, emit);
    expect(s.maxExtraction).toBe(2);
    expect(s.picks.at(-1)).toMatchObject({ level: 3, card: 'value', edition: 'base', value: 2 });
    expect(events[0]).toEqual({
      type: 'cardChosen',
      payload: { level: 3, card: 'value', edition: 'base', value: 2, final: false },
    });
    s.maxExtraction = 9;
    grantCard(s, 'value');
    expect(s.maxExtraction).toBe(11);
  });

  it('unlock and feature: the building or feature, once', () => {
    const s = atLevel3();
    completeLevel(s);
    force(s, 'bridge');
    chooseCard(s, 0);
    completeLevel(s);
    force(s, 'priorities');
    chooseCard(s, 0);
    expect(s.unlockedBuildings.filter((b) => b === 'bridge')).toHaveLength(1);
    expect(s.unlockedFeatures).toContain('priorities');
    grantCard(s, 'bridge');
    expect(s.unlockedBuildings.filter((b) => b === 'bridge')).toHaveLength(1);
  });

  it('edition: one more edition card of that edition', () => {
    const s = atLevel3();
    completeLevel(s);
    force(s, 'edition-legendaire');
    chooseCard(s, 0);
    expect(s.editionCards).toEqual({ brillante: 0, legendaire: 1 });
    grantCard(s, 'edition-brillante', 'legendaire'); // the card's own edition wins
    expect(s.editionCards).toEqual({ brillante: 1, legendaire: 1 });
  });

  it('special: N buildings of the drawn native edition', () => {
    const s = atLevel3();
    completeLevel(s);
    s.pendingLevels = [3];
    s.currentOffer = { level: 3, cards: [{ card: 'ancient-adder', edition: 'brillante' }] };
    chooseCard(s, 0);
    grantCard(s, 'ancient-adder', 'brillante');
    grantCard(s, 'ancient-adder');
    expect(s.specials).toEqual({ 'ancientAdder:brillante': 2, 'ancientAdder:base': 1 });
    expect(s.picks.at(-3)).toMatchObject({ card: 'ancient-adder', edition: 'brillante' });
  });

  it('passive: operators go faster', () => {
    const world = new World(atLevel3(), new DepositMap(42));
    const before = cycleDuration(world, 'adder');
    grantCard(world.state, 'passive-operators');
    expect(world.state.passives).toEqual(['operatorsBoost']);
    expect(cycleDuration(world, 'adder')).toBeCloseTo(
      before / PASSIVE_EFFECTS.operatorsBoost.operatorSpeed,
    );
  });

  it('meta: Éventail adds a third card to the next offers', () => {
    const s = atLevel3();
    for (let i = 0; i < 6; i++) completeLevel(s);
    s.pendingLevels = [8];
    force(s, 'eventail');
    chooseCard(s, 0);
    completeLevel(s);
    expect(ensureOffer(s)?.cards).toHaveLength(3);
  });
});

describe('refusals of the natural card', () => {
  it('count only offers that held it, and reset when it is obtained', () => {
    const s = atLevel3();
    expect(naturalAt(offerContext(s, 3)).card).toBe('value');
    completeLevel(s);
    force(s, 'value', 'bridge');
    chooseCard(s, 1); // refused the value
    expect(s.naturalRefusals).toBe(1);
    completeLevel(s);
    force(s, 'mult', 'edition-brillante'); // no natural card: not a refusal
    chooseCard(s, 1);
    expect(s.naturalRefusals).toBe(1);
    completeLevel(s);
    force(s, 'value', 'edition-brillante');
    chooseCard(s, 1);
    expect(s.naturalRefusals).toBe(2);
    expect(offerContext(s, 6).naturalRefusals).toBe(2);
    // Taken: the natural card moves on to the next item, the counter starts again.
    completeLevel(s);
    force(s, 'value', 'edition-brillante');
    chooseCard(s, 0);
    expect(s.naturalRefusals).toBe(0);
  });

  it('reset when the natural item is obtained any other way', () => {
    const s = atLevel3();
    s.naturalRefusals = 3;
    grantCard(s, 'edition-legendaire'); // not the natural item
    expect(s.naturalRefusals).toBe(3);
    grantCard(s, 'value');
    expect(s.naturalRefusals).toBe(0);
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

describe('the natural card, followed from level 1 to 30', () => {
  it('reproduces the former fixed rewards exactly', () => {
    for (const seed of [42, 7, 2024]) {
      const s = createInitialState(seed);
      for (const [level, max, buildings, features] of NATURAL_TABLE) {
        expect(s.level).toBe(level);
        completeLevel(s);
        const offer = ensureOffer(s);
        if (offer) {
          // Take the natural card; when the draw left it out, add it (we test the effects
          // here, the draw has its own tests).
          const natural = naturalAt(offerContext(s, level));
          let index = offer.cards.findIndex((c) => c.card === natural.card);
          if (index < 0) index = offer.cards.push({ card: natural.card, edition: 'base' }) - 1;
          expect(chooseCard(s, index)).toBe(true);
        }
        expect([
          level,
          s.maxExtraction,
          s.unlockedBuildings.join(' '),
          s.unlockedFeatures.join(' '),
        ]).toEqual([level, max, buildings, features]);
        expect(s.naturalRefusals).toBe(0);
      }
      expect(s.picks).toHaveLength(30);
    }
  });

  it('setLevel grants the same natural cards and drops the pending offers', () => {
    const s = atLevel3();
    completeLevel(s);
    completeLevel(s);
    s.naturalRefusals = 2;
    setLevel(s, 23);
    expect(s.pendingLevels).toEqual([]);
    expect(s.currentOffer).toBeNull();
    expect(s.naturalRefusals).toBe(0);
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
  it('infinite levels give an offer whose natural card is the next value', () => {
    const s = createInitialState(42);
    setLevel(s, 31);
    expect(s.maxExtraction).toBe(23);
    completeLevel(s);
    expect(s.pendingLevels).toEqual([31]);
    expect(s.maxExtraction).toBe(23);
    expect(naturalAt(offerContext(s, 31))).toEqual({ card: 'value', value: 24 });
    const offer = ensureOffer(s);
    expect(offer?.cards.find((c) => c.card === 'value')?.value).toBe(24);
    resolvePending(s, 'natural');
    expect(s.maxExtraction).toBe(24);
    setLevel(s, 41);
    expect(s.maxExtraction).toBe(33);
  });

  it('the final level gives an offer; the game ends once it is chosen', () => {
    const s = createInitialState(5);
    const levels = ensureLevels(s.seed, s.levels, 5000);
    setLevel(s, levels.length);
    const { events, emit } = recorder();
    completeLevel(s, emit);
    expect(s.levelRequirement).toBeNull();
    expect(s.finishedAtTick).toBe(s.tick);
    expect(s.pendingLevels).toEqual([levels.length]);
    expect(resolvePending(s, 'first', emit)).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['levelCompleted', 'offerReady', 'cardChosen']);
    expect(events.at(-1)?.payload).toMatchObject({ level: levels.length, final: true });
  });
});

describe('automatic choice (?pick=)', () => {
  it('parses the mode, natural by default', () => {
    expect(parsePickMode(null)).toBe('natural');
    expect(parsePickMode('bogus')).toBe('natural');
    expect(parsePickMode('first')).toBe('first');
    expect(parsePickMode('random')).toBe('random');
    expect(parsePickMode('none')).toBe('none');
  });

  it('natural, first, random and none', () => {
    const s = atLevel3();
    completeLevel(s);
    force(s, 'bridge', 'value');
    const offer = s.currentOffer;
    if (!offer) throw new Error('no offer');
    expect(autoPickIndex(s, offer, 'natural')).toBe(1);
    expect(autoPickIndex(s, offer, 'first')).toBe(0);
    expect(autoPickIndex(s, offer, 'none')).toBeNull();
    const r = autoPickIndex(s, offer, 'random');
    expect([0, 1]).toContain(r);
    expect(autoPickIndex(s, offer, 'random')).toBe(r); // seeded
    force(s, 'bridge', 'mult');
    expect(s.currentOffer && autoPickIndex(s, s.currentOffer, 'natural')).toBe(0); // fallback
    expect(resolvePending(s, 'none')).toBe(0);
    completeLevel(s);
    expect(resolvePending(s, 'random')).toBe(2);
    expect(s.pendingLevels).toEqual([]);
  });
});

describe('save version 2', () => {
  function rich(): GameState {
    const s = atLevel3();
    grantCard(s, 'edition-brillante');
    grantCard(s, 'edition-legendaire');
    grantCard(s, 'ancient-adder', 'legendaire');
    grantCard(s, 'passive-operators');
    grantCard(s, 'eventail');
    grantCard(s, 'value');
    s.naturalRefusals = 2;
    completeLevel(s);
    completeLevel(s);
    ensureOffer(s);
    return s;
  }

  it('round-trips every new field', async () => {
    const s = rich();
    const world = new World(s, new DepositMap(s.seed));
    const data = serialize(world, CAM);
    expect(data.version).toBe(SAVE_VERSION);
    for (const text of [await encodeSave(data), encodeSaveSync(data)]) {
      const back = deserialize(await decodeSave(text)).state;
      expect(back.picks).toEqual(s.picks);
      expect(back.pendingLevels).toEqual([3, 4]);
      expect(back.currentOffer).toEqual(s.currentOffer);
      expect(back.currentOffer?.cards).toHaveLength(3); // Éventail
      expect(back.editionCards).toEqual({ brillante: 1, legendaire: 1 });
      expect(back.specials).toEqual({ 'ancientAdder:legendaire': 1 });
      expect(back.passives).toEqual(['operatorsBoost']);
      expect(back.naturalRefusals).toBe(2);
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
      (d) => (d['pendingLevels'] = [4, 3]),
      (d) => (d['pendingLevels'] = [99]),
      (d) => Object.assign(d['currentOffer'] ?? {}, { level: 4 }),
      (d) => (d['specials'] = { 'adder:base': 1 }),
      (d) => (d['editionCards'] = { brillante: -1, legendaire: 0 }),
      (d) => (d['passives'] = ['nope']),
      (d) => delete d['naturalRefusals'],
    ];
    for (const mutate of cases) {
      const d = base();
      mutate(d);
      await expect(decodeSave(JSON.stringify(d))).rejects.toBeInstanceOf(SaveError);
    }
  });

  it('refuses a version 1 save cleanly, as outdated', async () => {
    const d = JSON.parse(
      JSON.stringify(serialize(new World(atLevel3(), new DepositMap(42)), CAM)),
    ) as Record<string, unknown>;
    d['version'] = 1;
    const error = await decodeSave(JSON.stringify(d)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveError);
    expect((error as SaveError).reason).toBe('outdated');
    await expect(importSave(JSON.stringify(d))).rejects.toMatchObject({ reason: 'outdated' });
    // A broken save keeps its own reason.
    const broken = await decodeSave('{"version":2}').catch((e: unknown) => e);
    expect((broken as SaveError).reason).toBe('invalid');
  });
});
