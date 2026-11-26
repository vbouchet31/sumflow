import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { operatorSpeed, START_BUILDINGS, START_MAX_EXTRACTION } from '../../src/config/balance';
import { CARDS } from '../../src/config/cards';
import {
  defaultTuning,
  KNOB_KINDS,
  KNOBS,
  knobValue,
  operatorSpeedFactor,
  serializeTuning,
  specialSpeedFactor,
  TUNED,
  TUNING_FILE,
  type TuningValues,
  validateKnobs,
  validateTuning,
  weightScale,
} from '../../src/config/tuning';
import { OPERATOR_TYPES } from '../../src/sim/entities';
import {
  cardWeight,
  curveAt,
  DEFAULT_CATALOGUE,
  naturalAt,
  type OfferContext,
} from '../../src/sim/offers';
import { cycleDuration } from '../../src/sim/operators';
import { makeWorld } from './helpers/scenario';

function ctxAt(level: number, over: Partial<OfferContext> = {}): OfferContext {
  return {
    seed: 42,
    level,
    maxExtraction: START_MAX_EXTRACTION,
    unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'],
    unlockedFeatures: ['upgrades'],
    picks: {},
    naturalRefusals: 0,
    ...over,
  };
}

const LEVELS = [1, 3, 5, 7, 10, 13, 16, 20, 30, 60];

describe('tuning file', () => {
  it('declares sound knobs: weight scale on every drawn card, speed on special buildings', () => {
    expect(validateKnobs()).toEqual([]);
    for (const c of CARDS) {
      expect(KNOBS[c.id]?.weightScale !== undefined, c.id).toBe(c.slot !== null);
      expect(KNOBS[c.id]?.speed !== undefined, c.id).toBe(c.effect.kind === 'special');
    }
    expect(KNOB_KINDS.weightScale).toEqual({ default: 1, min: 0.2, max: 3 });
    expect(KNOB_KINDS.speed).toEqual({ default: 1, min: 0.3, max: 1.5 });
  });

  it('holds a value for every knob, within its bounds', () => {
    expect(validateTuning(TUNED)).toEqual([]);
  });

  it('is in the canonical form the tuner writes', () => {
    expect(readFileSync(TUNING_FILE, 'utf8')).toBe(serializeTuning(TUNED));
  });

  it('validation catches unknown objects and knobs, missing and out-of-bound values', () => {
    const bad: TuningValues = {
      ...defaultTuning(),
      mult: { weightScale: 5 },
      concat: { weightScale: 1 },
      value: { weightScale: 1, speed: 1 },
      nope: { weightScale: 1 },
      bridge: { weightScale: Number.NaN },
    };
    expect(validateTuning(bad)).toEqual(
      expect.arrayContaining([
        'mult.weightScale: 5 outside [0.2, 3]',
        'concat.speed: missing',
        'value.speed: unknown knob',
        'nope: unknown object',
        'bridge.weightScale: not a finite number',
      ]),
    );
    expect(validateTuning(defaultTuning())).toEqual([]);
  });

  it('a missing value reads as the default', () => {
    expect(knobValue('mult', 'weightScale', {})).toBe(1);
    expect(weightScale('mult', { mult: { weightScale: 2 } })).toBe(2);
    expect(specialSpeedFactor('concat', { concat: { speed: 0.5 } })).toBe(0.5);
    expect(operatorSpeedFactor('adder', { concat: { speed: 0.5 } })).toBe(1);
  });
});

describe('default values give exactly the untuned game', () => {
  const untuned = { ...DEFAULT_CATALOGUE, tuning: defaultTuning() };

  it('card weights are their curves (plus natural floor and guards), unchanged', () => {
    for (const level of LEVELS) {
      const ctx = ctxAt(level);
      const natural = naturalAt(ctx).card;
      for (const c of CARDS) {
        if (c.id === natural) continue;
        // The multiplier is unlocked in this context: no guard applies.
        expect(cardWeight(c, ctx, untuned), `${c.id}@${level}`).toBe(curveAt(c.weight, level));
        // The live game reads tuning.json: its weight is the curve times the tuned scale.
        expect(cardWeight(c, ctx), `${c.id}@${level}`).toBeCloseTo(
          curveAt(c.weight, level) * knobValue(c.id, 'weightScale'),
          12,
        );
      }
    }
  });

  it('operator speeds are their track speeds, unchanged', () => {
    const world = makeWorld();
    for (const t of OPERATOR_TYPES) {
      expect(operatorSpeedFactor(t, defaultTuning())).toBe(1);
    }
    world.state.upgrades.adder = 4;
    world.state.upgrades.multiplier = 4;
    // The live game reads tuning.json: a special building runs at its tuned speed factor.
    expect(cycleDuration(world, { type: 'concat' })).toBeCloseTo(
      1 / (operatorSpeed('multiplier', 4) * operatorSpeedFactor('concat')),
      12,
    );
    expect(cycleDuration(world, { type: 'adder' })).toBe(1 / operatorSpeed('adder', 4));
    expect(cycleDuration(world, { type: 'divider' })).toBe(1 / operatorSpeed('subdiv', 1));
  });

  it('a tuned weight scale multiplies the curve in the draw', () => {
    const ctx = ctxAt(8);
    const card = CARDS.find((c) => c.id === 'bridge');
    if (!card) throw new Error('no bridge card');
    const tuned = { ...DEFAULT_CATALOGUE, tuning: { bridge: { weightScale: 2.5 } } };
    expect(cardWeight(card, ctx, tuned)).toBeCloseTo(2.5 * curveAt(card.weight, 8), 12);
  });
});

describe('the game reads tuning.json', () => {
  afterEach(() => {
    vi.doUnmock('../../src/config/tuning.json');
    vi.resetModules();
  });

  it('weights and special speeds follow the values in the file', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/tuning.json', () => ({
      default: {
        $comment: 'test',
        objects: { bridge: { weightScale: 2 }, concat: { weightScale: 1, speed: 0.5 } },
      },
    }));
    const offers = await import('../../src/sim/offers');
    const ops = await import('../../src/sim/operators');
    const cards = await import('../../src/config/cards');
    const scenario = await import('./helpers/scenario');
    const bridge = cards.CARDS.find((c) => c.id === 'bridge');
    if (!bridge) throw new Error('no bridge card');
    expect(offers.cardWeight(bridge, ctxAt(8))).toBe(2 * curveAt(bridge.weight, 8));
    const world = scenario.makeWorld();
    expect(ops.cycleDuration(world, { type: 'concat' })).toBeCloseTo(
      1 / (0.5 * operatorSpeed('multiplier', 1)),
      12,
    );
    expect(ops.cycleDuration(world, { type: 'adder' })).toBe(1 / operatorSpeed('adder', 1));
  });
});
