import { TICK_DT } from '../config/balance';
import { EPS } from './belts';
import { pushOut } from './outputs';
import { currentExtractorRate } from './upgrades';
import type { World } from './world';

/** Extractors produce (PLAN §11.2 step 1). At most one pending item: no internal stock. */
export function stepExtractors(world: World): void {
  const rate = currentExtractorRate(world.state);
  for (const b of world.state.buildings.values()) {
    // Sources (proposal 19) emit like an extractor, their own number.
    const value = b.type === 'source' ? b.sourceValue : b.extractValue;
    if ((b.type !== 'extractor' && b.type !== 'source') || value === undefined) continue;
    let acc = (b.extractAcc ?? 0) + rate * TICK_DT;
    while (acc >= 1 - EPS) {
      if (!pushOut(world, b, 'out', value)) {
        acc = Math.min(acc, 1);
        break;
      }
      acc -= 1;
    }
    b.extractAcc = Math.max(0, acc);
  }
}
