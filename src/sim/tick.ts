import { stepBelts } from './belts';
import { stepExtractors } from './extractor';
import type { World } from './world';

/**
 * One fixed simulation step of 1/60 s (PLAN §11.2). Operators, storage and stats are
 * added in later milestones; the hub consumes instantly when belts deliver.
 */
export function tick(world: World): void {
  world.state.tick += 1;
  world.stats.advance(world.state.tick);
  stepExtractors(world);
  stepBelts(world);
}

/** Run `n` ticks. */
export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) tick(world);
}
