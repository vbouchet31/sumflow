import { describe, expect, it } from 'vitest';
import { E, S } from '../../src/core/grid';
import { dirMask } from '../../src/sim/entities';
import { traceFlow } from '../../src/sim/trace';
import { makeWorld } from './helpers/scenario';

describe('flow trace', () => {
  it('follows a line both ways from the hovered belt, and not unrelated neighbours', () => {
    const world = makeWorld();
    for (let x = 20; x < 25; x++) world.setBelt(x, 20, dirMask(E));
    world.setBelt(25, 20, dirMask(S));
    world.setBelt(25, 21, dirMask(S));
    world.setBelt(22, 21, dirMask(E)); // beside the line, not joined to it
    const trace = traceFlow(world, 22, 20);
    expect(trace).not.toBeNull();
    const way = (x: number, y: number) => trace?.tiles.find((t) => t.x === x && t.y === y)?.way;
    expect(way(22, 20)).toBe(0);
    expect(way(20, 20)).toBe(-1);
    expect(way(25, 21)).toBe(1);
    expect(way(22, 21)).toBeUndefined();
    expect(trace?.tiles).toHaveLength(7);
  });

  it('ends at the hub', () => {
    const world = makeWorld();
    const hub = [...world.state.buildings.values()].find((b) => b.type === 'hub');
    if (!hub) throw new Error('no hub');
    // A belt pushing into the hub from its west side.
    world.setBelt(hub.x - 1, hub.y, dirMask(E));
    expect(traceFlow(world, hub.x - 1, hub.y)?.sinks).toEqual([hub.id]);
  });

  it('returns null away from belts', () => {
    expect(traceFlow(makeWorld(), 50, 50)).toBeNull();
  });
});
