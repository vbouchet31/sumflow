import { describe, expect, it } from 'vitest';
import { E, N, S, W } from '../../src/core/grid';
import { INT_MAX } from '../../src/core/intmath';
import { dirMask, portFaces } from '../../src/sim/entities';
import { compute } from '../../src/sim/operators';
import { runTicks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { beltLine, makeWorld } from './helpers/scenario';

/** Keep an operator's inputs topped up with constant values. */
function feed(world: World, id: number, a: number, b: number, ticks: number): void {
  const op = world.state.buildings.get(id);
  if (!op) throw new Error('missing operator');
  for (let i = 0; i < ticks; i++) {
    while ((op.inA?.length ?? 4) < 4) op.inA?.push(a);
    while ((op.inB?.length ?? 4) < 4) op.inB?.push(b);
    runTicks(world, 1);
  }
}

/** Adder at (20, 0); its O tile (20, 1) faces W onto a belt line into the hub. */
function adderToHub(world: World): number {
  const adder = world.addBuilding('adder', 20, 0, 0);
  beltLine(world, 19, 1, W, 17); // x = 19 .. 3, enters hub tile (2, 1)
  return adder.id;
}

describe('operator results', () => {
  it('computes each operation with A/B order', () => {
    expect(compute('adder', 3, 4)).toEqual({ O: 7 });
    expect(compute('multiplier', 3, 4)).toEqual({ O: 12 });
    expect(compute('subtractor', 3, 4)).toEqual({ O: -1 });
    expect(compute('subtractor', 4, 3)).toEqual({ O: 1 });
    expect(compute('exponent', 2, 5)).toEqual({ O: 32 });
    expect(compute('exponent', 5, 2)).toEqual({ O: 25 });
    expect(compute('exponent', 0, 0)).toEqual({ O: 1 });
    expect(compute('exponent', -2, 3)).toEqual({ O: -8 });
  });

  it('saturates', () => {
    expect(compute('multiplier', 100_000, 100_000)).toEqual({ O: INT_MAX });
    expect(compute('adder', INT_MAX, 1)).toEqual({ O: INT_MAX });
  });

  it('divider: R only when non-zero, b = 0, negatives', () => {
    expect(compute('divider', 17, 5)).toEqual({ Q: 3, R: 2 });
    expect(compute('divider', 20, 5)).toEqual({ Q: 4 });
    expect(compute('divider', 9, 0)).toEqual({ Q: 0, R: 9 });
    expect(compute('divider', -17, 5)).toEqual({ Q: -3, R: -2 });
  });
});

describe('operator simulation', () => {
  it('an adder at level 1 fed continuously makes 15 ± 1 results per minute', () => {
    const world = makeWorld();
    const id = adderToHub(world);
    feed(world, id, 1, 1, 60 * 30); // warm-up: fill the output line
    const before = world.state.totalDelivered;
    feed(world, id, 1, 1, 60 * 60);
    expect(Math.abs(world.state.totalDelivered - before - 15)).toBeLessThanOrEqual(1);
  });

  it('A − B keeps its order in the simulation', () => {
    const world = makeWorld();
    const sub = world.addBuilding('subtractor', 30, 0, 0); // A (30,0), O (30,1), B (31,1)
    feed(world, sub.id, 9, 4, 60 * 6);
    expect(sub.out?.[0]).toBe(5);
  });

  it('blocks when the output is full, then stops consuming inputs', () => {
    const world = makeWorld();
    const add = world.addBuilding('adder', 40, 0, 0); // no output connection
    feed(world, add.id, 1, 2, 60 * 30);
    expect(add.out).toEqual([3, 3]);
    expect(add.cycle).toBe(-1);
    expect(add.inA).toHaveLength(4);
    expect(add.inB).toHaveLength(4);
  });

  it('divider needs room in Q and R; a zero remainder is not emitted', () => {
    const world = makeWorld();
    const div = world.addBuilding('divider', 50, 0, 0);
    feed(world, div.id, 12, 4, 60 * 30);
    expect(div.outQ).toEqual([3, 3]);
    expect(div.outR).toEqual([]);
    const div2 = world.addBuilding('divider', 60, 0, 0);
    feed(world, div2.id, 14, 4, 60 * 30);
    expect(div2.outQ).toEqual([3, 3]);
    expect(div2.outR).toEqual([2, 2]);
  });

  it('belts deliver into A and B input faces, and only there', () => {
    const world = makeWorld();
    const add = world.addBuilding('adder', 70, 0, 0); // A (70,0) N/W, B (71,0) N/E
    world.setBelt(70, -1, dirMask(S)); // into A from the north
    world.setBelt(72, 0, dirMask(W)); // into B from the east
    world.setBelt(69, 1, dirMask(E)); // into O tile's west face: an output, blocked
    for (const [x, y] of [
      [70, -1],
      [72, 0],
      [69, 1],
    ] as const) {
      const b = world.beltAt(x, y);
      if (b) b.item = { value: x, progress: 0, from: null, stamp: 0 };
    }
    runTicks(world, 90);
    // Both inputs arrived: the cycle runs; A and B are only consumed at its end (PLAN §6.2).
    expect(add.inA).toEqual([70]);
    expect(add.inB).toEqual([72]);
    expect(add.cycle).toBeGreaterThan(0);
    expect(world.beltAt(69, 1)?.item?.value).toBe(69);
    runTicks(world, 60 * 4);
    expect(add.out?.length ?? 0).toBe(1);
    expect(add.out?.[0]).toBe(70 + 72);
  });

  it('an extractor feeds an adjacent operator input directly', () => {
    const world = makeWorld();
    world.addBuilding('extractor', 80, 0, 0, { extractValue: 3 }); // tiles x 80..82
    const add = world.addBuilding('adder', 83, 0, 0); // A (83,0) has a W face touching (82,0)
    runTicks(world, 60 * 5);
    expect(add.inA?.length).toBeGreaterThan(0);
    expect(add.inA?.every((v) => v === 3)).toBe(true);
  });

  it('rotated footprints expose rotated ports', () => {
    // Multiplier "A O B" rotated a quarter turn: A on top, B at the bottom.
    const faces = portFaces('multiplier', 0, 0, 1);
    const a = faces.filter((f) => f.kind === 'A');
    const b = faces.filter((f) => f.kind === 'B');
    const o = faces.filter((f) => f.kind === 'O');
    expect(a.every((f) => f.x === 0 && f.y === 0)).toBe(true);
    expect(a.map((f) => f.face).sort()).toEqual([N, E, W].sort());
    expect(b.every((f) => f.y === 2)).toBe(true);
    expect(b.map((f) => f.face).sort()).toEqual([E, S, W].sort());
    expect(o.map((f) => f.face).sort()).toEqual([E, W].sort());
  });
});

describe('level 2 with an adder', () => {
  it('1 + 1 from one extractor reaches the hub and completes level 2', () => {
    const world = makeWorld();
    world.state.unlockedBuildings.push('adder');
    world.state.levelRequirement = { value: 2, required: 20, delivered: 0 };
    world.state.level = 2;
    // Extractor of 1 at x 20..22, y -1..1. An adder rotated a quarter turn sits against its
    // west side: A (19,0) and B (19,1) face east and are fed by direct links; the outputs
    // (18,0) and (18,1) face west.
    world.addBuilding('extractor', 20, -1, 0, { extractValue: 1 });
    const add = world.addBuilding('adder', 18, 0, 1);
    beltLine(world, 17, 0, W, 15); // from the adder's west outputs to hub tile (2, 0)
    runTicks(world, 60 * 120);
    expect(add.flashTick).toBeGreaterThan(0);
    expect(world.state.level).toBe(3);
  });
});
