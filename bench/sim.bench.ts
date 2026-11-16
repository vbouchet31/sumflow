import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/config/balance';
import { buildReferenceScenario, countItems, REFERENCE } from '../src/debug/reference';
import { createInitialState } from '../src/sim/state';
import { runTicks, tick } from '../src/sim/tick';
import { World } from '../src/sim/world';
import { DepositMap } from '../src/world/chunks';

/** Budget of PLAN §10.4, in milliseconds per tick. */
const BUDGET_MS = 4;
const MEASURED_TICKS = 1200;

describe('sim bench', () => {
  it(
    'reference scenario: 20 000 belts, 1 000 buildings, ~15 000 items under 4 ms/tick',
    { timeout: 120_000 },
    () => {
      const state = createInitialState(1);
      const world = new World(state, new DepositMap(state.seed));
      buildReferenceScenario(world);
      runTicks(world, REFERENCE.warmupSeconds * TICK_RATE);

      const items = countItems(world);
      expect(state.belts.size).toBe(20_000);
      expect(state.buildings.size - 1).toBe(1_000); // without the hub
      expect(items).toBeGreaterThan(14_000);
      expect(items).toBeLessThan(16_000);

      const times: number[] = [];
      for (let i = 0; i < MEASURED_TICKS; i++) {
        const start = performance.now();
        tick(world);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
      const max = times[times.length - 1] ?? 0;
      process.stdout.write(
        `reference scenario: ${state.belts.size} belts, ${state.buildings.size - 1} buildings, ` +
          `${items} items\n` +
          `tick: mean ${mean.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${max.toFixed(3)} ms ` +
          `(budget ${BUDGET_MS} ms)\n`,
      );
      expect(mean).toBeLessThan(BUDGET_MS);
    },
  );
});
