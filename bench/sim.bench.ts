import { describe, expect, it } from 'vitest';

/** Average wall time per call, in milliseconds. */
export function measure(fn: () => void, iterations: number): number {
  for (let i = 0; i < Math.min(10, iterations); i++) fn(); // warm-up
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

// Placeholder until the simulation exists (M3+). The reference scenario of
// PLAN §10.4 (20 000 belts, 1 000 buildings, 15 000 items, < 4 ms/tick) lands in M11.
describe('sim bench', () => {
  it('measures a placeholder tick', () => {
    let acc = 0;
    const ms = measure(() => {
      for (let i = 0; i < 1000; i++) acc += i;
    }, 600);
    console.log(`placeholder tick: ${ms.toFixed(4)} ms`);
    expect(acc).toBeGreaterThan(0);
    expect(ms).toBeLessThan(4);
  });
});
