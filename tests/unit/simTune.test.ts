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
  failsWithinNoise,
  noiseMargin,
  roundSig,
  tune,
  tuneOutcome,
  verdictFlips,
  withKnobs,
} from '../../src/simtools/tune';
import type { CriterionResult, ObjectEvaluation } from '../../src/simtools/criteria';

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

  it('among passing points, prefers one with slack over the closest one', async () => {
    const knobs = { weightScale: KNOB_KINDS.weightScale };
    // Passes for w in [0.3, 0.9]; with slack only in [0.4, 0.6].
    const score = (v: { weightScale?: number }) => {
      const w = v.weightScale ?? 1;
      return {
        distance: Math.max(0, 0.3 - w, w - 0.9),
        robust: Math.max(0, 0.4 - w, w - 0.6),
      };
    };
    const r = await coordinateSearch(knobs, { weightScale: 1 }, score, settings);
    expect(r.best.distance).toBe(0);
    expect(r.best.robust).toBe(0);
    expect(r.best.values.weightScale).toBeGreaterThanOrEqual(0.4);
    expect(r.best.values.weightScale).toBeLessThanOrEqual(0.6);
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
    const best = { values: {}, distance: 0, robust: 0, deviation: 0 };
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

/** A criterion measured at `value` over `n` games. */
const crit = (value: number, pass: boolean, n = 60): CriterionResult => ({
  status: pass ? 'pass' : 'fail',
  value,
  distance: pass ? 0 : 0.1,
  target: '',
  n,
});

/** An object whose only varying criterion is visibility. */
function evalOf(card: string, visible: CriterionResult, placeholder = false): ObjectEvaluation {
  return {
    card,
    role: placeholder ? 'factice' : 'objet',
    placeholder,
    unmodeled: null,
    benchmark: 15,
    exposure: {},
    criteria: { essential: crit(1, true), useful: crit(0.5, true), visible },
    pass: visible.status === 'pass',
    distance: visible.distance,
  };
}

describe('regressions and noise', () => {
  it('the margin is max(7 points, 2 standard errors of a proportion)', () => {
    // p = 0.5, n = 60: 2 × √(0.25 / 60) ≈ 0.129.
    expect(noiseMargin(crit(0.45, true), crit(0.55, false))).toBeCloseTo(2 * Math.sqrt(0.25 / 60));
    // p near 0: the 7-point floor.
    expect(noiseMargin(crit(0.01, true), crit(0.01, false))).toBe(0.07);
    // The smaller sample counts.
    expect(noiseMargin(crit(0.5, true, 60), crit(0.5, false, 10))).toBeCloseTo(
      2 * Math.sqrt(0.25 / 10),
    );
  });

  it('a flip within the margin is to watch, beyond it a regression', () => {
    const before = [
      evalOf('a', crit(0.8, true)),
      evalOf('b', crit(0.8, true)),
      evalOf('fake', crit(0.8, true), true),
      evalOf('target', crit(0.9, false)),
      evalOf('c', crit(0.9, false)),
    ];
    const after = [
      evalOf('a', crit(0.83, false)), // +3 points: noise
      evalOf('b', crit(0.97, false)), // +17 points: beyond 2 standard errors (≈ 9.6)
      evalOf('fake', crit(1, false), true), // placeholder: never a regression
      evalOf('target', crit(0.6, true)),
      evalOf('c', crit(1, false)), // was already failing
    ];
    const flips = verdictFlips(before, after, 'target');
    expect(flips.map((f) => [f.card, f.criterion, f.beyondNoise])).toEqual([
      ['a', 'visible', false],
      ['b', 'visible', true],
    ]);
  });

  it('the tuned object may miss a threshold on the control seeds by less than the noise', () => {
    // 83 % visible for at most 80 %, 60 games: 3 points off, margin ≈ 9.7 points.
    const near = evalOf('x', { ...crit(0.83, false), distance: 0.03 });
    expect(failsWithinNoise(near)).toEqual(['visible']);
    const far = evalOf('x', { ...crit(0.95, false), distance: 0.15 });
    expect(failsWithinNoise(far)).toEqual([]);
    expect(failsWithinNoise(evalOf('x', crit(0.7, true)))).toEqual([]);
  });

  it('the tuner refuses a socle card', async () => {
    await expect(
      tune({ card: 'mult', seeds: 1, seedOffset: 1, controlSeedOffset: 9, maxLevel: 5 }),
    ).rejects.toThrow(/socle/);
  });
});

describe('tuned values written by --apply', () => {
  it('only the tuned object changes, the file stays canonical and valid', () => {
    const next = withKnobs(TUNED, 'concat', { weightScale: 0.5 });
    expect(validateTuning(next)).toEqual([]);
    const before = serializeTuning(TUNED).split('\n');
    const after = serializeTuning(next).split('\n');
    expect(after.length).toBe(before.length);
    const changed = after.filter((l, i) => l !== before[i]);
    expect(changed).toEqual(['      "weightScale": 0.5,']);
    // TUNED itself is untouched.
    expect(currentKnobs('concat')).toEqual({ weightScale: 1, speed: 1 });
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
      controlSeeds: 3,
      controlSeedOffset: 50,
      maxLevel: 14,
      settings: { gridPoints: 3, passes: 1, refineSteps: 0, digits: 2 },
      controlStrategies: [
        { kind: 'object', card: 'edition-legendaire' },
        { kind: 'once', card: 'edition-legendaire' },
      ] as const,
    };
    const r = await tune(opts);
    const again = await tune(opts);
    expect(again.tried.map((t) => [t.values, t.distance])).toEqual(
      r.tried.map((t) => [t.values, t.distance]),
    );
    expect(r.knobs).toBe(KNOBS['edition-legendaire']);
    expect(r.tried.length).toBeGreaterThanOrEqual(1);
    expect(r.control.before.result.seeds).toEqual([50, 51, 52]);
    expect([...r.control.before.result.runs.keys()]).toContain('once:edition-legendaire');
    expect(r.control.after.evals.map((e) => e.card)).toEqual(['edition-legendaire']);
    expect(['unchanged', 'proposed', 'no-solution', 'overfit', 'regression']).toContain(r.outcome);
    expect(conclusion(r, r.card).length).toBeGreaterThan(20);
    expect(readFileSync(TUNING_FILE, 'utf8')).toBe(file);
  });
});
