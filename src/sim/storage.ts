import { offer } from './belts';
import { outputGroup } from './outputs';
import type { World } from './world';

/**
 * Step 5 (PLAN §11.2): storages output at full speed. Each tick, every face with an
 * adjacent belt that does not point into the storage (an output face) and whose tile is
 * free receives one item. Back to 0, the value is released.
 */
export function stepStorages(world: World): void {
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'storage') continue;
    if ((b.storeCount ?? 0) <= 0) continue;
    for (const target of outputGroup(world, b, 'dynamic').targets) {
      const count = b.storeCount ?? 0;
      if (count <= 0 || b.storeValue === null || b.storeValue === undefined) break;
      // Belts only: storages do not feed buildings directly.
      if (target.kind !== 'belt') continue;
      if (!offer(world, target, b.storeValue, 0, null)) continue;
      b.storeCount = count - 1;
      if (b.storeCount === 0) b.storeValue = null;
    }
  }
}
