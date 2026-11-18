import { RICH, TICK_DT } from '../config/balance';
import { isRich } from '../world/deposits';
import type { Building } from './entities';
import { EPS } from './belts';
import { pushOut } from './outputs';
import { currentExtractorRate } from './upgrades';
import type { World } from './world';

/** Production multiplier of an extractor: 2 on a rich vein (proposal 11). */
export function richFactor(world: World, b: Building): number {
  let f = richCache.get(b);
  if (f === undefined) {
    const d = world.deposits.depositAt(b.x + 1, b.y + 1);
    f = d && isRich(world.state.seed, d) ? RICH.factor : 1;
    richCache.set(b, f);
  }
  return f;
}

/** Deposits never change under a building: its factor is looked up once. */
const richCache = new WeakMap<Building, number>();

/** Extractors produce (PLAN §11.2 step 1). At most one pending item: no internal stock. */
export function stepExtractors(world: World): void {
  const rate = currentExtractorRate(world.state);
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'extractor' || b.extractValue === undefined) continue;
    let acc = (b.extractAcc ?? 0) + rate * richFactor(world, b) * TICK_DT;
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
