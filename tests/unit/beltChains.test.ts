import { describe, expect, it } from 'vitest';
import { BELT_SHAPE } from '../../src/config/colors';
import { DIRS, type Dir, DX, DY, E, N, opposite, S, W } from '../../src/core/grid';
import type { Belt } from '../../src/sim/entities';
import { beltChains, railNodes } from '../../src/render/beltChains';
import { type BeltLinks, NO_BELT_LINKS } from '../../src/render/beltLinks';
import { turnRadius } from '../../src/render/layers/belts';

const K = BELT_SHAPE.band;

function belt(x: number, y: number, ...outs: Dir[]): Belt {
  return {
    x,
    y,
    outputs: outs.reduce<number>((m, d) => m | (1 << d), 0),
    item: null,
    rr: 0,
    rrIn: 0,
    priority: null,
    vacatedTick: 0,
    vacatedCarry: 0,
  };
}

/** Sides fed by another belt of the list, plus `extra` (x,y → mask) for buildings. */
function inputsFrom(list: Belt[], extra: Record<string, number> = {}): (b: Belt) => number {
  return (b) => {
    let mask = extra[`${b.x},${b.y}`] ?? 0;
    for (const d of DIRS) {
      const n = list.find((o) => o.x === b.x + DX[d] && o.y === b.y + DY[d]);
      if (n && n.outputs & (1 << opposite(d))) mask |= 1 << d;
    }
    return mask;
  };
}

/** Nothing around: no building, outputs lead nowhere. */
const ALONE: BeltLinks = { from: () => 0, into: () => 0, leads: () => 0 };

describe('belt chains (chalk rails)', () => {
  it('a straight line is one chain from edge to edge, closed at both loose ends', () => {
    const list = [belt(0, 0, E), belt(1, 0, E), belt(2, 0, E)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    expect(chains).toHaveLength(1);
    const c = chains[0];
    expect(c?.belts).toEqual(list);
    expect(c?.points).toEqual([
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1.5, y: 0.5 },
      { x: 2.5, y: 0.5 },
      { x: 3, y: 0.5 },
    ]);
    expect(c?.start.kind).toBe('loose');
    expect(c?.end.kind).toBe('loose');
    expect(gaps).toEqual([]);
  });

  it('a belt fed by a building and feeding another ends in doorways', () => {
    const list = [belt(0, 0, E), belt(1, 0, E)];
    const links: BeltLinks = {
      from: (b) => (b.x === 0 ? 1 << W : 0),
      into: (b) => (b.x === 1 ? 1 << E : 0),
      leads: (b) => (b.x === 1 ? 1 << E : 0),
    };
    const { chains } = beltChains(list, inputsFrom(list, { '0,0': 1 << W }), links);
    expect(chains[0]?.start).toMatchObject({ kind: 'door', x: 0, y: 0.5, d: W });
    expect(chains[0]?.end).toMatchObject({ kind: 'door', x: 2, y: 0.5, d: E });
  });

  it('a building output on the side makes a turn at the first belt', () => {
    // Fed from the north by a building, leaves east.
    const list = [belt(0, 0, E), belt(1, 0, E)];
    const { chains } = beltChains(list, inputsFrom(list, { '0,0': 1 << N }), {
      ...ALONE,
      from: (b) => (b.x === 0 ? 1 << N : 0),
    });
    expect(chains[0]?.points.slice(0, 2)).toEqual([
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(chains[0]?.start.kind).toBe('door');
  });

  it('bridge lanes and other unknown neighbours are left open', () => {
    const list = [belt(0, 0, E)];
    const { chains } = beltChains(list, () => 1 << W, NO_BELT_LINKS);
    expect(chains[0]?.start.kind).toBe('open');
    expect(chains[0]?.end.kind).toBe('open');
  });

  it('a merge from the side stops against the rail, which is rubbed out there', () => {
    const list = [belt(0, 0, E), belt(1, 0, E), belt(2, 0, E), belt(1, 1, N)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    expect(chains).toHaveLength(2);
    const main = chains.find((c) => c.belts.length === 3);
    const side = chains.find((c) => c.belts.length === 1);
    expect(main?.belts.map((b) => b.x)).toEqual([0, 1, 2]);
    expect(side?.end).toMatchObject({ kind: 'rail', x: 1.5, d: N });
    expect(side?.end.y).toBeCloseTo(0.5 + K);
    expect(gaps).toEqual([{ x: 1, y: 0, d: S }]);
  });

  it('a splitter goes straight on and its branch starts from the rail', () => {
    const list = [belt(0, 0, E), belt(1, 0, E, S), belt(2, 0, E), belt(1, 1, S)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    const main = chains.find((c) => c.belts.length === 3);
    const branch = chains.find((c) => c.belts.length === 1);
    expect(main?.belts.map((b) => b.x)).toEqual([0, 1, 2]);
    expect(branch?.start).toMatchObject({ kind: 'rail', x: 1.5, d: N });
    expect(branch?.start.y).toBeCloseTo(0.5 + K);
    expect(gaps).toEqual([{ x: 1, y: 0, d: S }]);
  });

  it('a + junction keeps the straight line and opens both sides', () => {
    const list = [belt(0, 0, E), belt(1, 0, E), belt(2, 0, E), belt(1, -1, S), belt(1, 1, N)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    expect(chains.find((c) => c.belts.length === 3)?.belts.map((b) => b.x)).toEqual([0, 1, 2]);
    expect(chains.filter((c) => c.end.kind === 'rail')).toHaveLength(2);
    expect(gaps).toEqual(
      expect.arrayContaining([
        { x: 1, y: 0, d: N },
        { x: 1, y: 0, d: S },
      ]),
    );
    expect(gaps).toHaveLength(2);
  });

  it('a splitter whose straight output leads nowhere carries the line on and closes it', () => {
    // The case of the screenshot: down, then west, then a junction west + south.
    const list = [belt(1, -1, S), belt(1, 0, W), belt(0, 0, W, S), belt(0, 1, S)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    const main = chains.find((c) => c.belts.length === 3);
    expect(main?.belts.map((b) => [b.x, b.y])).toEqual([
      [1, -1],
      [1, 0],
      [0, 0],
    ]);
    expect(main?.end).toMatchObject({ kind: 'loose', x: 0, y: 0.5, d: W });
    const branch = chains.find((c) => c.belts.length === 1);
    expect(branch?.start).toMatchObject({ kind: 'rail', x: 0.5, d: N });
    expect(gaps).toEqual([{ x: 0, y: 0, d: S }]);
  });

  it('a T junction with no way straight on is closed at the back', () => {
    // Fed from the west, splits north and south.
    const list = [belt(0, 0, E), belt(1, 0, N, S), belt(1, -1, N), belt(1, 1, S)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    const main = chains.find((c) => c.belts.some((b) => b.x === 0));
    expect(main?.belts).toHaveLength(2);
    expect(main?.end).toMatchObject({ kind: 'wall', y: 0.5, d: E });
    expect(main?.end.x).toBeCloseTo(1.5 + K);
    // The line stops on the near side of the junction: nothing crosses it, nothing to rub out.
    expect(main?.points.at(-1)?.x).toBeCloseTo(1.5 - K);
    expect(chains.filter((c) => c.start.kind === 'rail')).toHaveLength(2);
    expect(gaps).toEqual([]);
  });

  it('a junction fed only from both sides is closed at the back', () => {
    // Fed from the north and the south, leaves east.
    const list = [belt(1, -1, S), belt(1, 1, N), belt(1, 0, E), belt(2, 0, E)];
    const { chains, gaps } = beltChains(list, inputsFrom(list), ALONE);
    const main = chains.find((c) => c.belts.length === 2);
    expect(main?.start).toMatchObject({ kind: 'wall', y: 0.5, d: W });
    expect(main?.start.x).toBeCloseTo(1.5 - K);
    // The line starts on the far side of the junction.
    expect(main?.points[0]?.x).toBeCloseTo(1.5 + K);
    expect(chains.filter((c) => c.end.kind === 'rail')).toHaveLength(2);
    expect(gaps).toEqual([]);
  });

  it('a junction fed from behind by a building keeps its doorway', () => {
    const list = [belt(1, -1, S), belt(1, 0, E), belt(2, 0, E)];
    const { chains } = beltChains(list, inputsFrom(list, { '1,0': 1 << W }), {
      ...ALONE,
      from: (b) => (b.x === 1 && b.y === 0 ? 1 << W : 0),
    });
    const { gaps } = beltChains(list, inputsFrom(list, { '1,0': 1 << W }), ALONE);
    const main = chains.find((c) => c.belts.length === 2);
    expect(main?.start).toMatchObject({ kind: 'door', x: 1, y: 0.5, d: W });
    // The belt from the north merges in from the side instead of turning.
    expect(chains.find((c) => c.belts.length === 1)?.end.kind).toBe('rail');
    expect(gaps).toEqual([{ x: 1, y: 0, d: N }]);
  });

  it('a closed loop is drawn once, without hanging', () => {
    const list = [belt(0, 0, E), belt(1, 0, S), belt(1, 1, W), belt(0, 1, N)];
    const { chains } = beltChains(list, inputsFrom(list), ALONE);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.belts).toHaveLength(4);
  });

  it('every belt belongs to exactly one chain', () => {
    const list = [
      belt(0, 0, E),
      belt(1, 0, E, S),
      belt(2, 0, E),
      belt(3, 0, E),
      belt(1, 1, S),
      belt(1, 2, E),
      belt(2, 2, N),
      belt(2, 1, N),
    ];
    const { chains } = beltChains(list, inputsFrom(list), ALONE);
    const seen = chains.flatMap((c) => c.belts);
    expect(seen).toHaveLength(list.length);
    expect(new Set(seen).size).toBe(list.length);
  });
});

describe('rail nodes', () => {
  it('a straight rail runs at `band` from the centre line, on each side', () => {
    const points = [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.5 },
    ];
    expect(railNodes(points, 1, 0.07).map((n) => n.y)).toEqual([0.5 + K, 0.5 + K, 0.5 + K]);
    expect(railNodes(points, -1, 0.07).map((n) => n.y)).toEqual([0.5 - K, 0.5 - K, 0.5 - K]);
    expect(railNodes(points, 1, 0.07).every((n) => n.r === undefined)).toBe(true);
  });

  it('in a turn the outer rail follows the corner radius, the inner one is almost square', () => {
    // East, then south: the turn is at (0.5, 0.5); the outer rail is on the north-east side.
    const points = [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 1 },
    ];
    const r = turnRadius();
    const left = railNodes(points, 1, r)[1];
    const right = railNodes(points, -1, r)[1];
    const outer = [left, right].find((n) => n && n.y < 0.5);
    const inner = [left, right].find((n) => n && n.y > 0.5);
    expect(outer).toMatchObject({ x: 0.5 + K, y: 0.5 - K });
    expect(outer?.r).toBeCloseTo(r + K);
    expect(inner).toMatchObject({ x: 0.5 - K, y: 0.5 + K });
    expect(inner?.r).toBeLessThan(0.1);
  });

  it('the wobble moves straight nodes across the line only', () => {
    const points = [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ];
    const nodes = railNodes(points, 1, 0.07, () => 0.05);
    expect(nodes.map((n) => n.x)).toEqual([0, 1]);
    expect(nodes[0]?.y).toBeCloseTo(0.5 + K + 0.05);
  });
});
