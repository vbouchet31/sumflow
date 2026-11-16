import { describe, expect, it } from 'vitest';
import { STORAGE_CAPACITY } from '../../src/config/balance';
import { E, W } from '../../src/core/grid';
import { storeItem } from '../../src/sim/belts';
import { dirMask } from '../../src/sim/entities';
import { runTicks } from '../../src/sim/tick';
import { beltLine, makeWorld, runScenario } from './helpers/scenario';

describe('storage', () => {
  it('fixes its value on the first item, refuses a second value and caps at 10 000', () => {
    const world = makeWorld();
    const st = world.addBuilding('storage', 20, -1, 0);
    expect(st.storeValue).toBeNull();
    expect(storeItem(st, 7)).toBe(true);
    expect(storeItem(st, 8)).toBe(false);
    expect(st).toMatchObject({ storeValue: 7, storeCount: 1 });
    st.storeCount = STORAGE_CAPACITY;
    expect(storeItem(st, 7)).toBe(false);
  });

  it('a belt carrying another value blocks in front of it', () => {
    const world = makeWorld();
    const st = world.addBuilding('storage', 20, -1, 0); // tiles x 20..22, y -1..1
    st.storeValue = 5;
    st.storeCount = 3;
    world.setBelt(19, 0, dirMask(E)); // points into the storage: an input face
    const belt = world.beltAt(19, 0);
    if (!belt) throw new Error();
    belt.item = { value: 9, progress: 0, from: null, stamp: 0 };
    runTicks(world, 120);
    expect(belt.item?.value).toBe(9);
    expect(belt.item?.progress).toBe(1);
    expect(st.storeCount).toBe(3);
  });

  it('releases its value at 0', () => {
    const world = makeWorld();
    const st = world.addBuilding('storage', 20, -1, 0);
    st.storeValue = 4;
    st.storeCount = 2;
    beltLine(world, 23, 0, E, 5); // east face, belts pointing away: an output
    runTicks(world, 200);
    expect(st.storeCount).toBe(0);
    expect(st.storeValue).toBeNull();
    expect(storeItem(st, 6)).toBe(true);
  });

  it('outputs at full belt speed (saturated)', () => {
    for (const speed of [1, 4]) {
      const { delivered, world } = runScenario(
        (w) => {
          w.state.upgrades.belt = speed;
          const st = w.addBuilding('storage', 13, -1, 0); // x 13..15, west face at (13, 0)
          st.storeValue = 3;
          st.storeCount = STORAGE_CAPACITY;
          beltLine(w, 12, 0, W, 10); // into hub tile (2, 0)
        },
        60,
        15,
      );
      expect(Math.abs((delivered.get(3) ?? 0) - 60 * speed)).toBeLessThanOrEqual(1);
      expect(world.state.buildings.size).toBe(2);
    }
  });

  it('buffers a flow: in at one side, out at the other', () => {
    const world = makeWorld();
    world.state.upgrades.extractor = 3;
    world.addBuilding('extractor', 30, -1, 0, { extractValue: 2 }); // x 30..32
    beltLine(world, 29, 0, W, 2); // (29,0) → (28,0) → storage east face (27, 0)
    const st = world.addBuilding('storage', 25, -1, 0); // x 25..27
    runTicks(world, 60 * 20);
    expect(st.storeValue).toBe(2);
    expect(st.storeCount).toBeGreaterThan(10);
    beltLine(world, 24, 0, W, 22); // west output, down to hub tile (2, 0)
    runTicks(world, 60 * 25); // let the output line fill up
    const before = st.storeCount ?? 0;
    runTicks(world, 60 * 10);
    // Out at belt speed (1/s) while the input keeps adding 1/s: count roughly stable.
    expect(Math.abs((st.storeCount ?? 0) - before)).toBeLessThanOrEqual(2);
  });
});
