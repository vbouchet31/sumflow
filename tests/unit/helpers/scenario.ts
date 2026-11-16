import { TICK_RATE } from '../../../src/config/balance';
import { type Dir, DX, DY } from '../../../src/core/grid';
import { dirMask } from '../../../src/sim/entities';
import { createInitialState } from '../../../src/sim/state';
import { runTicks } from '../../../src/sim/tick';
import { World } from '../../../src/sim/world';
import { DepositMap } from '../../../src/world/chunks';

export function makeWorld(seed = 1): World {
  const state = createInitialState(seed);
  return new World(state, new DepositMap(state.seed));
}

/** Straight belt line of `length` tiles from `(x, y)` going `dir`. */
export function beltLine(world: World, x: number, y: number, dir: Dir, length: number): void {
  for (let i = 0; i < length; i++) world.setBelt(x + DX[dir] * i, y + DY[dir] * i, dirMask(dir));
}

export interface ScenarioResult {
  world: World;
  /** Hub deliveries per value during the measured window. */
  delivered: Map<number, number>;
}

/**
 * Build a mini-world with `setup`, optionally warm up, then simulate `seconds` and
 * return hub deliveries counted during that window (PLAN §16).
 */
export function runScenario(
  setup: (world: World) => void,
  seconds: number,
  warmupSeconds = 0,
): ScenarioResult {
  const world = makeWorld();
  setup(world);
  runTicks(world, Math.round(warmupSeconds * TICK_RATE));
  const delivered = new Map<number, number>();
  const off = world.events.on('delivered', ({ value }) => {
    delivered.set(value, (delivered.get(value) ?? 0) + 1);
  });
  runTicks(world, Math.round(seconds * TICK_RATE));
  off();
  return { world, delivered };
}
