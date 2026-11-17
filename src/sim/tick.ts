import { stepBeacons } from './beacon';
import { stepBelts } from './belts';
import { stepExtractors } from './extractor';
import { stepOperators, stepOutputs } from './operators';
import { stepStorages } from './storage';
import type { World } from './world';

/**
 * One fixed simulation step of 1/60 s (PLAN §11.2). The hub consumes instantly when
 * belts deliver; stats advance first.
 */
export function tick(world: World): void {
  world.state.tick += 1;
  world.stats.advance(world.state.tick);
  stepBeacons(world);
  stepExtractors(world);
  stepBelts(world);
  stepOutputs(world);
  stepOperators(world);
  stepStorages(world);
}

/** Run `n` ticks. */
export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) tick(world);
}
