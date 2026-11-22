import { TICK_DT } from '../config/balance';
import { EPS } from './belts';
import { editionEffect } from './inventory';
import type { Building } from './entities';
import { pushOut } from './outputs';
import { currentExtractorRate } from './upgrades';
import type { World } from './world';

/**
 * Output of one extractor in items/s: the upgraded rate times its edition (PLAN-recompenses
 * §3.4).
 */
export function extractorRate(world: World, b: Building): number {
  return currentExtractorRate(world.state) * (editionEffect(b).rate ?? 1);
}

/** Extractors produce (PLAN §11.2 step 1). At most one pending item: no internal stock. */
export function stepExtractors(world: World): void {
  const rate = currentExtractorRate(world.state);
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'extractor' || b.extractValue === undefined) continue;
    const own = b.edition === undefined ? rate : rate * (editionEffect(b).rate ?? 1);
    let acc = (b.extractAcc ?? 0) + own * TICK_DT;
    while (acc >= 1 - EPS) {
      if (!pushOut(world, b, 'out', b.extractValue)) {
        acc = Math.min(acc, 1);
        break;
      }
      acc -= 1;
    }
    b.extractAcc = Math.max(0, acc);
  }
}
