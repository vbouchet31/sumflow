import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KNOB_KINDS,
  KNOBS,
  serializeTuning,
  TUNED,
  TUNING_FILE,
  validateTuning,
} from '../../src/config/tuning';
import { conclusion, parseArgs, UsageError } from '../../src/simtools/cli';
import {
  coordinateSearch,
  currentKnobs,
  knobGrid,
  roundSig,
  tune,
  tuneOutcome,
  withKnobs,
} from '../../src/simtools/tune';

const settings = { gridPoints: 9, passes: 3, refineSteps: 2, digits: 2 };

describe('tuner search', () => {
  it('grids are log-spaced within the bounds, with the current value', () => {
    const g = knobGrid(KNOB_KINDS.weightScale, 1, 9, 2);
    expect(g[0]).toBe(0.2);
    expect(g[g.length - 1]).toBe(3);
    expect(g).toContain(1);
    expect([...g].sort((a, b) => a - b)).toEqual(g);
    expect(roundSig(0.123456, 2)).toBe(0.12);
  });

  it('finds the satisfying value closest to the current one, deterministically', async () => {
    // Satisfied for w within ±10 % (log) of 0.5: the grid point closest to 1 is 0.55.
    const distance = (v: { weightScale?: number }) =>
      Math.max(0, Math.abs(Math.log((v.weightScale ?? 1) / 0.5)) - 0.1);
    const knobs = { weightScale: KNOB_KINDS.weightScale };
    const a = await coordinateSearch(knobs, { weightScale: 1 }, distance, settings);
    const b = await coordinateSearch(knobs, { weightScale: 1 }, distance, settings);
    expect(a.best.distance).toBe(0);
    expect(a.best.values.weightScale).toBeGreaterThanOrEqual(0.5 * Math.exp(-0.1));
    expect(a.best.values.weightScale).toBeLessThanOrEqual(0.5 * Math.exp(0.1));
    expect(a.best.values.weightScale).toBeGreaterThanOrEqual(0.55); // nearest to 1
    expect(a.tried.map((t) => t.values)).toEqual(b.tried.map((t) => t.values));
    expect(a.tried.length).toBeLessThanOrEqual(9 + 1 + 4);
  });

  it('keeps the current values when they already satisfy the criteria', async () => {
    let calls = 0;
    const r = await coordinateSearch(
      { weightScale: KNOB_KINDS.weightScale, speed: KNOB_KINDS.speed },
      { weightScale: 1, speed: 1 },
      () => {
        calls++;
        return 0;
      },
      settings,
    );
    expect(r.best.values).toEqual({ weightScale: 1, speed: 1 });
    expect(calls).toBe(1);
  });

  it('searches every knob, one at a time', async () => {
    // Needs a low weight and a high speed.
    const distance = (v: { weightScale?: number; speed?: number }) =>
      Math.max(0, (v.weightScale ?? 1) - 0.4) + Math.max(0, 1.2 - (v.speed ?? 1));
    const r = await coordinateSearch(
      { weightScale: KNOB_KINDS.weightScale, speed: KNOB_KINDS.speed },
      { weightScale: 1, speed: 1 },
      distance,
      settings,
    );
    expect(r.best.distance).toBe(0);
    expect(r.best.values.weightScale).toBeLessThanOrEqual(0.4);
    expect(r.best.values.speed).toBeGreaterThanOrEqual(1.2);
  });

  it('reports the best value when nothing satisfies the criteria', async () => {
    const r = await coordinateSearch(
      { weightScale: KNOB_KINDS.weightScale },
      { weightScale: 1 },
      (v) => 10 - (v.weightScale ?? 1), // better and better up to the bound, never 0
      settings,
    );
    expect(r.best.values.weightScale).toBe(3);
    expect(r.best.distance).toBeGreaterThan(0);
  });

  it('outcomes', () => {
    const best = { values: {}, distance: 0, deviation: 0 };
    const base = {
      changed: true,
      best,
      targetPassesControl: true,
      regressions: [],
      acceptRegressions: false,
    };
    expect(tuneOutcome(base)).toBe('proposed');
    expect(tuneOutcome({ ...base, changed: false })).toBe('unchanged');
    expect(tuneOutcome({ ...base, best: { ...best, distance: 0.1 } })).toBe('no-solution');
    expect(tuneOutcome({ ...base, targetPassesControl: false })).toBe('overfit');
    expect(tuneOutcome({ ...base, regressions: ['x'] })).toBe('regression');
    expect(tuneOutcome({ ...base, regressions: ['x'], acceptRegressions: true })).toBe('proposed');
  });
});

describe('tuned values written by --apply', () => {
  it('only the tuned object changes, the file stays canonical and valid', () => {
    const next = withKnobs(TUNED, 'ancient-adder', { weightScale: 0.5 });
    expect(validateTuning(next)).toEqual([]);
    const before = serializeTuning(TUNED).split('\n');
    const after = serializeTuning(next).split('\n');
    expect(after.length).toBe(before.length);
    const changed = after.filter((l, i) => l !== before[i]);
    expect(changed).toEqual(['      "weightScale": 0.5,']);
    // TUNED itself is untouched.
    expect(currentKnobs('ancient-adder')).toEqual({ weightScale: 1, speed: 1 });
    expect(readFileSync(TUNING_FILE, 'utf8')).toBe(serializeTuning(TUNED));
  });

  it('command line flags', () => {
    const a = parseArgs(['mult', '--apply', '--seeds', '4', '--max-level=20'], ['apply']);
    expect(a.positional).toEqual(['mult']);
    expect(a.flags.get('apply')).toBe(true);
    expect(a.flags.get('seeds')).toBe('4');
    expect(a.flags.get('max-level')).toBe('20');
    expect(() => parseArgs(['--seeds'], [])).toThrow(UsageError);
  });
});

describe('tuner on a tiny run', () => {
  it('runs the search and the control, writes nothing, explains its verdict', async () => {
    const file = readFileSync(TUNING_FILE, 'utf8');
    const opts = {
      card: 'edition-legendaire',
      seeds: 2,
      seedOffset: 1,
      controlSeedOffset: 50,
      maxLevel: 14,
      settings: { gridPoints: 3, passes: 1, refineSteps: 0, digits: 2 },
      controlStrategies: [{ kind: 'object', card: 'edition-legendaire' }] as const,
    };
    const r = await tune(opts);
    const again = await tune(opts);
    expect(again.tried.map((t) => [t.values, t.distance])).toEqual(
      r.tried.map((t) => [t.values, t.distance]),
    );
    expect(r.knobs).toBe(KNOBS['edition-legendaire']);
    expect(r.tried.length).toBeGreaterThanOrEqual(1);
    expect(r.control.before.result.seeds).toEqual([50, 51]);
    expect(r.control.after.evals.map((e) => e.card)).toEqual(['edition-legendaire']);
    expect(['unchanged', 'proposed', 'no-solution', 'overfit', 'regression']).toContain(r.outcome);
    expect(conclusion(r, r.card).length).toBeGreaterThan(20);
    expect(readFileSync(TUNING_FILE, 'utf8')).toBe(file);
  });
});
