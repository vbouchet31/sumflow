import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards';
import { autoPickIndex } from '../../src/sim/autoPick';
import { setLevel } from '../../src/sim/progression';
import { grantCard } from '../../src/sim/rewards';
import { createInitialState, type StoredOffer } from '../../src/sim/state';
import { CRITERIA } from '../../src/simtools/config';
import {
  benchmarkOf,
  essentialCriterion,
  evaluateObject,
  longestRunBelow,
  quantile,
  thresholdsOf,
  invasiveCriterion,
  usefulCriterion,
  visibleCriterion,
} from '../../src/simtools/criteria';
import { GAME_LEVELS, type GameRecord } from '../../src/simtools/game';
import { isSocle, judgedCards, roleOf, unmodeledReason } from '../../src/simtools/roles';
import { UNMODELED } from '../../src/simtools/config';
import { naturalSequence } from '../../src/sim/offers';
import {
  bands,
  bandStats,
  markdownReport,
  rhythmStats,
  timeToLevel,
} from '../../src/simtools/report';
import {
  defaultStrategies,
  runSimulation,
  type RunResult,
  type StrategyRun,
} from '../../src/simtools/run';
import {
  cardPrerequisites,
  parseStrategy,
  pickIndex,
  REFERENCE,
  strategyName,
} from '../../src/simtools/strategies';

const card = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

describe('strategies (PLAN-paliers §5.2)', () => {
  const atLevel9 = () => {
    const s = createInitialState(1);
    setLevel(s, 9);
    return s;
  };
  const offer: StoredOffer = {
    level: 9,
    palier: 1,
    cards: [
      { card: 'edition-brillante', edition: 'brillante' },
      { card: 'eventail', edition: 'base' },
    ],
  };

  it('parses the strategy names; natural and minimal are gone with the fil rouge offers', () => {
    for (const n of ['none', 'random', 'new', 'object:concat', 'once:eventail']) {
      const s = parseStrategy(n, CARDS);
      expect(s && strategyName(s)).toBe(n);
    }
    expect(parseStrategy('natural', CARDS)).toBeNull();
    expect(parseStrategy('minimal', CARDS)).toBeNull();
    expect(parseStrategy('object:adder', CARDS)).toBeNull(); // never drawn
    expect(parseStrategy('object:mult', CARDS)).toBeNull(); // the socle is never drawn
    expect(parseStrategy('object:nope', CARDS)).toBeNull();
    expect(parseStrategy('greedy', CARDS)).toBeNull();
    expect(strategyName(REFERENCE)).toBe('none');
  });

  it('pick the card each strategy says, or nothing', () => {
    const s = atLevel9();
    expect(pickIndex(s, offer, { kind: 'none' })).toBeNull();
    expect(pickIndex(s, offer, { kind: 'object', card: 'eventail' })).toBe(1);
    expect(pickIndex(s, offer, { kind: 'object', card: 'concat' })).toBeNull(); // not offered
    expect(pickIndex(s, offer, { kind: 'random' })).toBe(autoPickIndex(s, offer, 'random'));
    expect(pickIndex(s, offer, { kind: 'new' })).toBe(0); // both are new: the first
    expect(pickIndex(s, offer, { kind: 'once', card: 'eventail' })).toBe(1);
    grantCard(s, 'edition-brillante');
    expect(pickIndex(s, offer, { kind: 'new' })).toBe(1); // the edition is not new any more
    expect(pickIndex(s, { ...offer, cards: [] }, { kind: 'random' })).toBeNull();
  });

  it('object and once take the cards their object needs: Éventail I for Éventail II', () => {
    expect(cardPrerequisites('eventail-2')).toEqual(['eventail']);
    expect(cardPrerequisites('concat')).toEqual([]);
    const s = atLevel9();
    expect(pickIndex(s, offer, { kind: 'object', card: 'eventail-2' })).toBe(1);
    expect(pickIndex(s, offer, { kind: 'once', card: 'eventail-2' })).toBe(1);
    grantCard(s, 'eventail');
    expect(pickIndex(s, offer, { kind: 'object', card: 'eventail-2' })).toBeNull();
  });

  it('once: the object the first time only, then nothing', () => {
    const s = atLevel9();
    const id = 'edition-brillante';
    expect(pickIndex(s, offer, { kind: 'once', card: id })).toBe(0);
    expect(pickIndex(s, offer, { kind: 'object', card: id })).toBe(0);
    grantCard(s, id);
    expect(pickIndex(s, offer, { kind: 'once', card: id })).toBeNull();
    expect(pickIndex(s, offer, { kind: 'object', card: id })).toBe(0);
  });
});

/** A fake game with the given index profile (times = index, the reference all 1). */
function game(
  index: number[],
  picks: [number, string][] = [],
  firstOffered: Record<string, number> = {},
  exposure: { offered?: Record<string, number>; available?: Record<string, number> } = {},
): GameRecord {
  return {
    seed: 1,
    strategy: 'x',
    targets: index.map(() => 1),
    quantities: index.map(() => 1),
    times: index,
    segments: index.map((t) => [t]),
    picks: picks.map(([level, c]) => ({ level, palier: 1, card: c, edition: 'base' })),
    firstOffered,
    offered: exposure.offered ?? {},
    available: exposure.available ?? {},
  };
}

function run(games: GameRecord[]): StrategyRun {
  return { strategy: 'object:x', games, index: games.map((g) => g.times) };
}

describe('criteria', () => {
  const t = thresholdsOf('x');

  it('quantiles and runs', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
    expect(longestRunBelow([1, 0.4, 0.4, 1, 0.4, 0.4, 0.4], 0.5)).toBe(3);
    expect(longestRunBelow([0.5, 0.5], 0.5)).toBe(0); // "under" is strict
  });

  it('1. not essential: at most 10 % of the games with more than 3 levels in a row under 0.5', () => {
    const ok = game([1, 0.4, 0.4, 0.4, 1]);
    const bad = game([1, 0.4, 0.4, 0.4, 0.4]);
    const nine = essentialCriterion(run([...Array(9).fill(ok), bad]), t);
    expect(nine).toMatchObject({ status: 'pass', value: 0.9, distance: 0 });
    const eight = essentialCriterion(run([...Array(8).fill(ok), bad, bad]), t);
    expect(eight.status).toBe('fail');
    expect(eight.distance).toBeCloseTo(0.1);
  });

  it('2. not useless: median share of the levels after the first pick under 1', () => {
    // Picked at a palier of level 3: levels 3.. count (the rest of level 3 included).
    const g = (ix: number[]) => game(ix, [[3, 'x']]);
    const r = run([
      g([1, 1, 0.9, 1, 1]),
      g([1, 1, 0.9, 0.9, 1]),
      g([1, 1, 1, 1, 1]),
      game([0.1, 0.1]),
    ]);
    const c = usefulCriterion(r, 'x', t);
    expect(c.value).toBeCloseTo(1 / 3); // shares 1/3, 2/3, 0; the unpicked game is ignored
    expect(c.status).toBe('pass');
    expect(usefulCriterion(run([game([1, 0.2])]), 'x', t)).toMatchObject({
      status: 'fail',
      note: 'jamais pris',
    });
  });

  it('3. visible: offered before the benchmark level in 50 to 80 % of the games', () => {
    const seen = game([1], [], { x: 5 });
    const late = game([1], [], { x: 15 });
    const never = game([1]);
    expect(visibleCriterion(run([seen, seen, late, never]), 'x', 15, t)).toMatchObject({
      status: 'pass',
      value: 0.5,
    });
    expect(visibleCriterion(run([seen, seen, seen, seen, never]), 'x', 15, t).status).toBe('pass');
    expect(visibleCriterion(run([seen, seen, seen, seen, late]), 'x', 15, t)).toMatchObject({
      status: 'pass',
      value: 0.8,
    });
    const always = visibleCriterion(run([seen, seen]), 'x', 15, t);
    expect(always).toMatchObject({ status: 'fail', value: 1 });
    expect(always.distance).toBeCloseTo(0.2);
    // No offer before the first palier (level 6): the criterion does not apply.
    expect(visibleCriterion(run([seen]), 'x', 6, t).status).toBe('n/a');
  });

  it('4. not invasive: in at most 40 % of the offers drawn while available (median)', () => {
    const g = (offered: number, available: number) =>
      game([1], [], {}, { offered: { x: offered }, available: { x: available } });
    const ok = invasiveCriterion(run([g(1, 10), g(4, 10), g(8, 10)]), 'x', t);
    expect(ok).toMatchObject({ status: 'pass', value: 0.4, distance: 0 });
    const bad = invasiveCriterion(run([g(5, 10), g(6, 10), game([1])]), 'x', t);
    expect(bad.status).toBe('fail');
    expect(bad.value).toBeCloseTo(0.55); // the game where it never was available is ignored
    expect(bad.distance).toBeCloseTo(0.15);
    expect(invasiveCriterion(run([game([1])]), 'x', t)).toMatchObject({ status: 'n/a' });
    // A unique card is taken the first time it shows: the criterion does not apply.
    const fan = game([1], [], {}, { offered: { eventail: 1 }, available: { eventail: 1 } });
    expect(invasiveCriterion(run([fan]), 'eventail', t)).toMatchObject({ status: 'n/a' });
  });

  it('thresholds are configuration, benchmarks come from the natural sequence', () => {
    expect(thresholdsOf('mult')).toEqual(CRITERIA);
    expect(benchmarkOf('mult')).toBe(7);
    expect(benchmarkOf('storage')).toBe(22);
    expect(benchmarkOf('edition-legendaire')).toBe(15);
    expect(unmodeledReason('eventail')).not.toBeNull();
    expect(unmodeledReason('bridge')).not.toBeNull();
    expect(unmodeledReason('concat')).toBeNull();
    for (const id of Object.keys(UNMODELED)) expect(CARDS.some((c) => c.id === id)).toBe(true);
  });

  it('the socle is the natural sequence, never hard-coded', () => {
    const natural = new Set(naturalSequence().map((s) => s.card));
    for (const c of CARDS) {
      expect(isSocle(c.id)).toBe(natural.has(c.id));
      expect(roleOf(c)).toBe(natural.has(c.id) ? 'socle' : c.placeholder ? 'factice' : 'objet');
    }
    expect(judgedCards().map((c) => c.id)).toEqual([
      'edition-brillante',
      'edition-legendaire',
      'concat',
      'eventail',
      'eventail-2',
    ]);
  });
});

describe('rhythm of the rewards (PLAN-paliers §5.4)', () => {
  it('pools the parts of the levels of each band; time to finish a level', () => {
    const g = game([10, 20, 30]);
    g.segments = [[10], [5, 15], [10, 10, 10]];
    const h = game([20, 20, 20]);
    h.segments = [[20], [10, 10], [5, 5, 10]];
    const r = run([g, h]);
    const [band] = rhythmStats(r, 3);
    expect(band).toMatchObject({ from: 1, to: 3, median: 10 });
    expect(timeToLevel(r, 2)).toBe(35); // 30 and 40
    expect(timeToLevel(r, 3)).toBe(60);
  });
});

describe('a small run', () => {
  let result: RunResult;
  const get = async (): Promise<RunResult> => {
    result ??= await runSimulation({
      seeds: 3,
      seedOffset: 1,
      maxLevel: 25,
      strategies: [
        { kind: 'random' },
        { kind: 'object', card: 'edition-legendaire' },
        { kind: 'once', card: 'edition-legendaire' },
        { kind: 'object', card: 'eventail' },
      ],
    });
    return result;
  };

  it('none is the reference: its index is exactly 1', async () => {
    const r = await get();
    expect([...r.runs.keys()]).toEqual([
      'none',
      'random',
      'object:edition-legendaire',
      'once:edition-legendaire',
      'object:eventail',
    ]);
    for (const ix of r.runs.get('none')?.index ?? []) for (const x of ix) expect(x).toBe(1);
    // No palier before level 6: every strategy plays levels 1 to 5 alike.
    for (const run of r.runs.values())
      for (const ix of run.index) expect(ix.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    // Each level with paliers is cut in parts: 2 from level 6, 3 from 12, 4 from 16.
    const g = r.runs.get('none')?.games[0];
    expect(g?.segments.map((parts) => parts.length)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]);
    g?.segments.forEach((parts, i) =>
      expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(g.times[i] ?? 0),
    );
  });

  it('taking objects makes the game easier than the fil rouge alone', async () => {
    const r = await get();
    const stats = bandStats(r.runs.get('random') ?? run([]), 25);
    expect(stats.map((b) => [b.from, b.to])).toEqual(bands(25));
    expect(stats[0]?.median).toBeLessThanOrEqual(1);
    expect(stats[2]?.median).toBeLessThan(1);
    expect(stats[2]?.median).toBeGreaterThan(0.3);
  });

  it('level settings change the times: no palier, or lower quantities', async () => {
    const base = await get();
    const noPalier = await runSimulation({
      seeds: 1,
      seedOffset: 1,
      maxLevel: 20,
      strategies: [],
      levels: { ...GAME_LEVELS, paliers: [] },
    });
    expect(noPalier.runs.get('none')?.games[0]?.segments.every((p) => p.length === 1)).toBe(true);
    const half = await runSimulation({
      seeds: 1,
      seedOffset: 1,
      maxLevel: 20,
      strategies: [],
      levels: { ...GAME_LEVELS, quantityFactor: [{ from: 16, factor: 0.375 }] },
    });
    const t = (res: RunResult, l: number) => res.runs.get('none')?.games[0]?.times[l - 1] ?? 0;
    expect(t(half, 15)).toBeCloseTo(t(base, 15));
    expect(t(half, 18) / t(base, 18)).toBeCloseTo(0.5, 1);
  });

  it('evaluations and the report: criterion 4, the rhythm, what the model cannot see', async () => {
    const r = await get();
    const eventail = evaluateObject(r, card('eventail'));
    expect(eventail?.criteria.useful).toMatchObject({ status: 'n/a', distance: 0 });
    expect(eventail?.criteria.useful.note).toMatch(/^non modélisé : /);
    expect(eventail?.criteria.invasive.status).toBe('n/a'); // unique card
    expect(evaluateObject(r, card('bridge'))).toBeNull(); // socle: not judged
    expect(evaluateObject(r, card('concat'))).toBeNull(); // no object:concat run
    const legendary = evaluateObject(r, card('edition-legendaire'));
    expect(legendary?.role).toBe('objet');
    expect(legendary?.criteria.invasive.status).not.toBe('n/a');
    const md = markdownReport(
      r,
      [legendary, eventail].flatMap((e) => (e ? [e] : [])),
      { title: 'T' },
    );
    expect(md).toContain('`once:edition-legendaire`');
    expect(md).toContain('n/a (non modélisé');
    expect(md).toContain('## Rythme des récompenses');
    expect(md).toContain('4. Pas envahissant');
    expect(md).toContain('Niveau 20 fini');
    expect(md).not.toContain('## Socle');
  });

  it('the default run has object: and once: for every judged card, none for the socle', () => {
    const names = defaultStrategies().map(strategyName);
    expect(names.slice(0, 3)).toEqual(['none', 'random', 'new']);
    for (const c of CARDS) {
      const judged = c.drawable && !isSocle(c.id);
      expect(names.includes(`object:${c.id}`)).toBe(judged);
      expect(names.includes(`once:${c.id}`)).toBe(judged);
    }
  });
});
