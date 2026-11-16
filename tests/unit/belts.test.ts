import { describe, expect, it } from 'vitest';
import { E, N, S, W } from '../../src/core/grid';
import { beltStatus } from '../../src/sim/belts';
import { dirMask } from '../../src/sim/entities';
import { computeNetwork } from '../../src/sim/network';
import { runTicks } from '../../src/sim/tick';
import { beltLine, makeWorld, runScenario } from './helpers/scenario';

/** Extractor whose west face touches a belt line running west into the hub's east side. */
function feedHub(extractorLevel: number, value = 1) {
  return (world: ReturnType<typeof makeWorld>) => {
    world.state.upgrades.extractor = extractorLevel;
    world.addBuilding('extractor', 13, -1, 0, { extractValue: value });
    beltLine(world, 12, 0, W, 10); // x = 12 .. 3, enters hub tile (2, 0)
  };
}

describe('belts', () => {
  it('a full belt at speed 1 delivers 60 ± 1 items per minute', () => {
    // Extractor level 2 (2 items/s) saturates the single belt.
    const { delivered } = runScenario(feedHub(2), 60, 20);
    expect(Math.abs((delivered.get(1) ?? 0) - 60)).toBeLessThanOrEqual(1);
  });

  it.each([2, 5, 8])(
    'a full belt at speed %i delivers speed × 60 ± 1 items per minute',
    (speed) => {
      const { delivered } = runScenario(
        (w) => {
          feedHub(12)(w);
          w.state.upgrades.belt = speed;
        },
        60,
        10,
      );
      expect(Math.abs((delivered.get(1) ?? 0) - speed * 60)).toBeLessThanOrEqual(1);
    },
  );

  it('an extractor at level 1 with 3 connected outputs produces 1 item/s in total', () => {
    const { delivered } = runScenario(
      (w) => {
        w.addBuilding('extractor', 13, -1, 0, { extractValue: 1 });
        // Three west-going lines from the extractor's west faces (y = -1, 0, 1), merging
        // at x = 4 into the hub? Keep them separate: each enters the hub directly.
        beltLine(w, 12, -1, W, 10);
        beltLine(w, 12, 0, W, 10);
        beltLine(w, 12, 1, W, 10);
      },
      60,
      20,
    );
    expect(Math.abs((delivered.get(1) ?? 0) - 60)).toBeLessThanOrEqual(1);
  });

  it('completes level 1 (10 × 1) and reaches level 2', () => {
    const { world } = runScenario(feedHub(1), 40);
    expect(world.state.level).toBe(2);
    expect(world.state.levelRequirement).toMatchObject({ value: 2, required: 20, delivered: 0 });
  });

  it('keeps items one tile apart and never loses or duplicates them', () => {
    const world = makeWorld();
    feedHub(3)(world);
    runTicks(world, 600);
    const items = [...world.state.belts.values()].filter((b) => b.item).length;
    const produced = world.state.totalDelivered + items;
    // 10 s at a capped rate of 1 item/s (belt speed 1), started at tick 1.
    expect(produced).toBeGreaterThanOrEqual(9);
    expect(produced).toBeLessThanOrEqual(11);
  });

  it('blocks on a face without input and reports it', () => {
    const world = makeWorld();
    world.addBuilding('extractor', 20, -1, 0, { extractValue: 1 });
    // (18,0) → (19,0) → extractor tile (20,0), whose west face is an output, not an input.
    beltLine(world, 18, 0, E, 2);
    const first = world.beltAt(18, 0);
    if (!first) throw new Error();
    first.item = { value: 3, progress: 0, from: null, stamp: 0 };
    runTicks(world, 600);
    const last = world.beltAt(19, 0);
    expect(last?.item?.progress).toBe(1);
    if (last) expect(beltStatus(world, last)).toBe('noInput');
  });

  it('two belts pointing at each other block (head-on)', () => {
    const world = makeWorld();
    world.setBelt(30, 0, dirMask(E));
    world.setBelt(31, 0, dirMask(W));
    const a = world.beltAt(30, 0);
    if (!a) throw new Error();
    a.item = { value: 1, progress: 0, from: null, stamp: 0 };
    runTicks(world, 120);
    expect(world.beltAt(30, 0)?.item?.value).toBe(1);
    expect(world.beltAt(31, 0)?.item).toBeNull();
  });

  it('a closed loop keeps circulating without deadlock or duplication', () => {
    const world = makeWorld();
    // 2×2 loop: (40,0)→E, (41,0)→S, (41,1)→W, (40,1)→N
    world.setBelt(40, 0, dirMask(E));
    world.setBelt(41, 0, dirMask(S));
    world.setBelt(41, 1, dirMask(W));
    world.setBelt(40, 1, dirMask(N));
    const start = world.beltAt(40, 0);
    if (!start) throw new Error();
    start.item = { value: 7, progress: 0, from: null, stamp: 0 };
    runTicks(world, 60 * 7);
    const items = [...world.state.belts.values()].filter((b) => b.item);
    expect(items).toHaveLength(1);
    expect(items[0]?.item?.value).toBe(7);
  });
});

describe('network order', () => {
  it('orders a chain downstream first', () => {
    const world = makeWorld();
    beltLine(world, 50, 0, E, 4);
    const order = computeNetwork(world.state.belts).order;
    const xs = order.map((k) =>
      [...world.state.belts.values()].find((b) => b && k === k && b),
    ).length;
    expect(xs).toBe(4);
    const pos = (x: number) =>
      order.findIndex(
        (k) => world.state.belts.get(k)?.x === x && world.state.belts.get(k)?.y === 0,
      );
    expect(pos(53)).toBeLessThan(pos(52));
    expect(pos(52)).toBeLessThan(pos(51));
    expect(pos(51)).toBeLessThan(pos(50));
  });

  it('lists merge inputs and is deterministic', () => {
    const world = makeWorld();
    world.setBelt(60, 0, dirMask(E)); // → (61,0)
    world.setBelt(61, -1, dirMask(S)); // → (61,0)
    world.setBelt(61, 0, dirMask(E));
    const net = computeNetwork(world.state.belts);
    const ins = [...net.inputs.values()][0];
    expect(ins).toHaveLength(2);
    expect(computeNetwork(world.state.belts)).toEqual(net);
  });
});
