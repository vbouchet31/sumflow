import { describe, expect, it } from 'vitest';
import { WorkerPool } from '../../src/simtools/pool';
import { runSimulation, type RunResult } from '../../src/simtools/run';

/** What a run computes, without its timing. */
const games = (r: RunResult) => [...r.runs.values()].map((s) => [s.strategy, s.games, s.index]);

describe('worker pool', () => {
  it('gives exactly the games of a run in this process', { timeout: 60_000 }, async () => {
    const opts = {
      seeds: 3,
      seedOffset: 5,
      maxLevel: 20,
      strategies: [{ kind: 'random' }, { kind: 'object', card: 'concat' }] as const,
    };
    const local = await runSimulation(opts);
    const pool = await WorkerPool.start(2);
    try {
      const parallel = await runSimulation(opts, pool.run);
      expect(games(parallel)).toEqual(games(local));
      expect(parallel.levels).toBe(local.levels);
    } finally {
      await pool.close();
    }
  });
});
