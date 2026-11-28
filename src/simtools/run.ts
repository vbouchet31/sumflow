/**
 * A simulation run (PLAN-objets §3, PLAN-paliers §5): every strategy on the same seeds, then
 * the difficulty index of each game and level: its level time divided by the `none` game's
 * on the same seed (1 = the fil rouge alone, without any object). Games are independent and
 * deterministic, so a run gives the same result in one process or spread over worker threads
 * (`pool.ts`).
 */
import { CARDS, type CardDef } from '../config/cards';
import { TUNED, type TuningValues } from '../config/tuning';
import { COST } from './config';
import { CostCache } from './cost';
import { GAME_LEVELS, type GameRecord, type LevelSettings, playGame } from './game';
import { judgedCards } from './roles';
import { BASE_STRATEGIES, REFERENCE, type Strategy, strategyName } from './strategies';

export interface RunOptions {
  seeds: number;
  seedOffset: number;
  maxLevel: number;
  strategies: readonly Strategy[];
  tuning?: TuningValues;
  /** Paliers and quantity factors to play with (the game's by default). */
  levels?: LevelSettings;
}

export interface StrategyRun {
  strategy: string;
  /** Games in seed order. */
  games: GameRecord[];
  /** `index[g][L - 1]`: time of game g at level L / `none` time (same seed, same level). */
  index: number[][];
}

export interface RunResult {
  seeds: number[];
  maxLevel: number;
  /** By strategy name, `none` (the reference) first. */
  runs: Map<string, StrategyRun>;
  ms: number;
  /** Cost tables computed, levels played (timing report). */
  tables: number;
  levels: number;
}

/** The games of one seed: every strategy of the run, in order. */
export interface SeedTask {
  seed: number;
  strategies: Strategy[];
  maxLevel: number;
  tuning: TuningValues;
  levels: LevelSettings;
}

export interface SeedResult {
  games: GameRecord[];
  tables: number;
}

/** Something that plays seed tasks: this process (`playSeeds`) or a worker pool. */
export type SeedRunner = (tasks: readonly SeedTask[]) => Promise<SeedResult[]>;

/** The two strategies judging an object: every time offered, then only the first time. */
export function objectStrategies(card: string): Strategy[] {
  return [
    { kind: 'object', card },
    { kind: 'once', card },
  ];
}

/**
 * Default strategies: the base ones, then `object:<id>` and `once:<id>` for every card
 * the criteria judge (not the socle, reported from the base strategies).
 */
export function defaultStrategies(cards: readonly CardDef[] = CARDS): Strategy[] {
  return [...BASE_STRATEGIES, ...judgedCards(cards).flatMap((c) => objectStrategies(c.id))];
}

export function seedList(seeds: number, offset: number): number[] {
  return Array.from({ length: seeds }, (_, i) => offset + i);
}

/** Strategies of a run: `none` first (the reference), then the others without repeats. */
export function runStrategies(strategies: readonly Strategy[]): Strategy[] {
  const out: Strategy[] = [REFERENCE];
  for (const s of strategies) {
    if (!out.some((t) => strategyName(t) === strategyName(s))) out.push(s);
  }
  return out;
}

/** Play one seed task in this process. */
export function playSeed(task: SeedTask, cache: CostCache): SeedResult {
  const before = cache.computed;
  const games = task.strategies.map((strategy) =>
    playGame({
      seed: task.seed,
      strategy,
      maxLevel: task.maxLevel,
      cache,
      tuning: task.tuning,
      levels: task.levels,
    }),
  );
  return { games, tables: cache.computed - before };
}

/** A runner playing in this process, with its own cost cache. */
export function localRunner(cache = new CostCache(COST.margin, COST.cacheNumbers)): SeedRunner {
  return (tasks) => Promise.resolve(tasks.map((t) => playSeed(t, cache)));
}

/** Index of every game against the `none` game of its seed. */
function assemble(
  opts: RunOptions,
  seeds: number[],
  strategies: Strategy[],
  results: readonly SeedResult[],
  ms: number,
): RunResult {
  const runs = new Map<string, StrategyRun>();
  strategies.forEach((s, k) => {
    const games = results.map((r) => r.games[k]).filter((g): g is GameRecord => g !== undefined);
    runs.set(strategyName(s), { strategy: strategyName(s), games, index: [] });
  });
  const reference = runs.get(strategyName(REFERENCE));
  let levels = 0;
  for (const run of runs.values()) {
    run.index = run.games.map((g, i) => {
      levels += g.times.length;
      const ref = reference?.games[i]?.times ?? [];
      return g.times.map((t, l) => t / (ref[l] ?? t));
    });
  }
  const tables = results.reduce((s, r) => s + r.tables, 0);
  return { seeds, maxLevel: opts.maxLevel, runs, ms, tables, levels };
}

/** Run every strategy on every seed with `runner` (in this process by default). */
export async function runSimulation(
  opts: RunOptions,
  runner: SeedRunner = localRunner(),
): Promise<RunResult> {
  const start = performance.now();
  const seeds = seedList(opts.seeds, opts.seedOffset);
  const strategies = runStrategies(opts.strategies);
  const tuning = opts.tuning ?? TUNED;
  const levels = opts.levels ?? GAME_LEVELS;
  const tasks = seeds.map((seed) => ({
    seed,
    strategies,
    maxLevel: opts.maxLevel,
    tuning,
    levels,
  }));
  const results = await runner(tasks);
  return assemble(opts, seeds, strategies, results, performance.now() - start);
}
