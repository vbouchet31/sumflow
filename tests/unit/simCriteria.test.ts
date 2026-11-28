import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards';
import { autoPickIndex } from '../../src/sim/autoPick';
import { completeLevel } from '../../src/sim/progression';
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
  usefulCriterion,
  visibleCriterion,
} from '../../src/simtools/criteria';
import type { GameRecord } from '../../src/simtools/game';
import { isSocle, judgedCards, roleOf, unmodeledReason } from '../../src/simtools/roles';
import { UNMODELED } from '../../src/simtools/config';
import { naturalSequence } from '../../src/sim/offers';
import { bands, bandStats, markdownReport } from '../../src/simtools/report';
import {
  defaultStrategies,
  runSimulation,
  type RunResult,
  type StrategyRun,
} from '../../src/simtools/run';
import { parseStrategy, pickIndex, strategyName } from '../../src/simtools/strategies';

const card = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

describe('strategies', () => {
  const atLevel3 = () => {
    const s = createInitialState(1);
    completeLevel(s); // level 1: adder
    completeLevel(s); // level 2: upgrades
    return s; // level 3: value 2 is the next fil rouge item
  };
  const offer: StoredOffer = {
    level: 3,
    palier: 1,
    cards: [
      { card: 'value', edition: 'base', value: 2 },
      { card: 'bridge', edition: 'base' },
    ],
  };

  it('parses the strategy names', () => {
    for (const n of ['natural', 'random', 'new', 'minimal', 'object:concat', 'once:eventail']) {
      const s = parseStrategy(n, CARDS);
      expect(s && strategyName(s)).toBe(n);
    }
    expect(parseStrategy('object:adder', CARDS)).toBeNull(); // never drawn
    expect(parseStrategy('object:mult', CARDS)).toBeNull(); // the socle is never drawn
    expect(parseStrategy('object:nope', CARDS)).toBeNull();
    expect(parseStrategy('greedy', CARDS)).toBeNull();
  });

  it('pick the card each strategy says', () => {
    const s = atLevel3();
    expect(pickIndex(s, offer, { kind: 'natural' })).toBe(0); // value is the natural card
    expect(pickIndex(s, offer, { kind: 'minimal' })).toBe(1); // never a value
    expect(pickIndex(s, offer, { kind: 'object', card: 'bridge' })).toBe(1);
    expect(pickIndex(s, offer, { kind: 'object', card: 'mult' })).toBe(0); // not offered: natural
    expect(pickIndex(s, offer, { kind: 'random' })).toBe(autoPickIndex(s, offer, 'random'));
    expect(pickIndex(s, offer, { kind: 'new' })).toBe(0); // both are new: the first
    expect(pickIndex(s, offer, { kind: 'once', card: 'bridge' })).toBe(1);
    grantCard(s, 'value');
    expect(pickIndex(s, offer, { kind: 'new' })).toBe(1); // value is not new any more
  });

  it('once: the object the first time only, then the natural rule', () => {
    const s = atLevel3();
    const legendary: StoredOffer = {
      level: 3,
      palier: 1,
      cards: [
        { card: 'value', edition: 'base', value: 2 },
        { card: 'edition-legendaire', edition: 'legendaire' },
      ],
    };
    expect(pickIndex(s, legendary, { kind: 'once', card: 'edition-legendaire' })).toBe(1);
    expect(pickIndex(s, legendary, { kind: 'object', card: 'edition-legendaire' })).toBe(1);
    grantCard(s, 'edition-legendaire');
    expect(pickIndex(s, legendary, { kind: 'once', card: 'edition-legendaire' })).toBe(0);
    expect(pickIndex(s, legendary, { kind: 'object', card: 'edition-legendaire' })).toBe(1);
  });

  it('minimal falls back to the natural rule when only values are offered', () => {
    const s = atLevel3();
    const only: StoredOffer = {
      level: 3,
      palier: 1,
      cards: [{ card: 'value', edition: 'base', value: 2 }],
    };
    expect(pickIndex(s, only, { kind: 'minimal' })).toBe(0);
  });
});

/** A fake game with the given index profile (times = index, the reference all 1). */
function game(
  index: number[],
  picks: [number, string][] = [],
  offered: Record<string, number> = {},
): GameRecord {
  return {
    seed: 1,
    strategy: 'x',
    targets: index.map(() => 1),
    quantities: index.map(() => 1),
    times: index,
    picks: picks.map(([level, c]) => ({ level, card: c, edition: 'base' })),
    firstOffered: offered,
    offered: {},
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
    // Picked at the offer of level 2: levels 3.. count.
    const g = (ix: number[]) => game(ix, [[2, 'x']]);
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
    // No offer before level 3: the criterion does not apply.
    expect(visibleCriterion(run([seen]), 'x', 3, t).status).toBe('n/a');
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
      'passive-operators',
      'eventail',
      'eventail-2',
    ]);
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
        { kind: 'minimal' },
        { kind: 'object', card: 'edition-legendaire' },
        { kind: 'once', card: 'edition-legendaire' },
        { kind: 'object', card: 'eventail' },
        { kind: 'object', card: 'bridge' },
      ],
    });
    return result;
  };

  it('natural is the reference: its index is exactly 1', async () => {
    const r = await get();
    expect([...r.runs.keys()]).toEqual([
      'natural',
      'minimal',
      'object:edition-legendaire',
      'once:edition-legendaire',
      'object:eventail',
      'object:bridge',
    ]);
    for (const ix of r.runs.get('natural')?.index ?? []) for (const x of ix) expect(x).toBe(1);
    // Levels 1 and 2 are fixed: every strategy plays them alike.
    for (const run of r.runs.values())
      for (const ix of run.index) expect(ix.slice(0, 2)).toEqual([1, 1]);
  });

  it('refusing values changes little: every level gives its fil rouge (PLAN-paliers §3.1)', async () => {
    const r = await get();
    const stats = bandStats(r.runs.get('minimal') ?? run([]), 25);
    expect(stats.map((b) => [b.from, b.to])).toEqual(bands(25));
    expect(stats[1]?.median).toBeGreaterThan(0.8);
    expect(stats[1]?.median).toBeLessThan(1.25);
  });

  it('evaluations and the report mark what the model cannot see', async () => {
    const r = await get();
    const eventail = evaluateObject(r, card('eventail'));
    expect(eventail?.criteria.useful).toMatchObject({ status: 'n/a', distance: 0 });
    expect(eventail?.criteria.useful.note).toMatch(/^non modélisé : /);
    expect(evaluateObject(r, card('bridge'))).toBeNull(); // socle: not judged
    expect(evaluateObject(r, card('concat'))).toBeNull(); // no object:concat run
    const legendary = evaluateObject(r, card('edition-legendaire'));
    expect(legendary?.role).toBe('objet');
    const md = markdownReport(
      r,
      [legendary, eventail].flatMap((e) => (e ? [e] : [])),
      { title: 'T' },
    );
    expect(md).toContain('`once:edition-legendaire`');
    expect(md).toContain('n/a (non modélisé');
    expect(md).toContain('## Socle (fil rouge), pour information');
    const from = md.indexOf('## Socle');
    const socle = md.slice(from, md.indexOf('\n## ', from + 1));
    expect(socle).toContain('`mult`');
    expect(socle).not.toContain('à revoir');
  });

  it('the default run has object: and once: for every judged card, none for the socle', () => {
    const names = defaultStrategies().map(strategyName);
    expect(names.slice(0, 4)).toEqual(['natural', 'random', 'new', 'minimal']);
    for (const c of CARDS) {
      if (!c.drawable) continue;
      const judged = !isSocle(c.id);
      expect(names.includes(`object:${c.id}`)).toBe(judged);
      expect(names.includes(`once:${c.id}`)).toBe(judged);
    }
  });
});
