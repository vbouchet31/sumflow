import { stepBelts } from './belts';
import { stepExtractors } from './extractor';
import { stepOperators, stepOutputs } from './operators';
import type { World } from './world';

/**
 * One fixed simulation step of 1/60 s (PLAN §11.2). Storage arrives in M8; the hub
 * consumes instantly when belts deliver; stats advance first.
 */
export function tick(world: World): void {
  world.state.tick += 1;
  world.stats.advance(world.state.tick);
  stepExtractors(world);
  stepBelts(world);
  stepOutputs(world);
  stepOperators(world);
}

/** Run `n` ticks. */
export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) tick(world);
}
