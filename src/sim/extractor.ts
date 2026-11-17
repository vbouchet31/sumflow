import { TICK_DT } from '../config/balance';
import { EPS } from './belts';
import { pushOut } from './outputs';
import { currentExtractorRate } from './upgrades';
import type { World } from './world';

/** Extractors produce (PLAN §11.2 step 1). At most one pending item: no internal stock. */
export function stepExtractors(world: World): void {
  const rate = currentExtractorRate(world.state);
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'extractor' || b.extractValue === undefined) continue;
    if (b.meteor !== undefined && !world.state.meteors.active.some((m) => m.id === b.meteor))
      continue; // the meteorite has faded: nothing left to mine
    let acc = (b.extractAcc ?? 0) + rate * TICK_DT;
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
