import { describe, expect, it } from 'vitest';
import { RICH } from '../../src/config/balance';
import { runTicks } from '../../src/sim/tick';
import { DepositMap } from '../../src/world/chunks';
import { depositDistance, isRich } from '../../src/world/deposits';
import { makeWorld } from './helpers/scenario';

describe('rich veins', () => {
  it('are a stable, seeded minority, never near the hub', () => {
    const map = new DepositMap(42);
    const all = [];
    for (let cy = -6; cy <= 6; cy++)
      for (let cx = -6; cx <= 6; cx++) all.push(...map.getChunk(cx, cy));
    const rich = all.filter((d) => isRich(42, d));
    expect(rich.length / all.length).toBeGreaterThan(0.05);
    expect(rich.length / all.length).toBeLessThan(0.25);
    expect(rich.every((d) => depositDistance(d.x, d.y) >= RICH.minDistance)).toBe(true);
    expect(rich.every((d) => isRich(42, { ...d }))).toBe(true);
  });

  it('double the output of an extractor', () => {
    const world = makeWorld(42);
    const map = world.deposits;
    let rich = null;
    let plain = null;
    for (let cy = -4; cy <= 4 && (!rich || !plain); cy++) {
      for (let cx = -4; cx <= 4; cx++) {
        for (const d of map.getChunk(cx, cy)) {
          if (depositDistance(d.x, d.y) < RICH.minDistance) continue;
          if (isRich(42, d)) rich ??= d;
          else plain ??= d;
        }
      }
    }
    if (!rich || !plain) throw new Error('no deposits');
    const a = world.addBuilding('extractor', rich.x - 1, rich.y - 1, 0, { extractValue: 1 });
    const b = world.addBuilding('extractor', plain.x - 1, plain.y - 1, 0, { extractValue: 1 });
    // No outputs: count how fast the accumulator fills during one tick.
    a.extractAcc = 0;
    b.extractAcc = 0;
    runTicks(world, 1);
    expect((a.extractAcc ?? 0) / (b.extractAcc ?? 1)).toBeCloseTo(RICH.factor);
  });
});
