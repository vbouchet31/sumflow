import { TICK_DT } from '../config/balance';
import type { Building } from './entities';
import { EPS, offer, resolveTarget } from './belts';
import { currentExtractorRate } from './upgrades';
import type { World } from './world';

/**
 * Push one item from a building output port set, round-robin among connected outputs that
 * have room (PLAN §6.3). A belt is an output target only if it does not point back at us.
 */
export function pushFromPorts(world: World, b: Building, value: number): boolean {
  const ports = (world.buildingPorts.get(b.id) ?? []).filter((p) => p.kind === 'out');
  const n = ports.length;
  for (let i = 0; i < n; i++) {
    const idx = (b.rrOut + i) % n;
    const p = ports[idx];
    if (!p) continue;
    const target = resolveTarget(world, p.x, p.y, p.face);
    if (target.kind !== 'belt') continue; // direct building links arrive in M5
    if (offer(world, target, value, 0, null)) {
      b.rrOut = (idx + 1) % n;
      return true;
    }
  }
  return false;
}

/** Extractors produce (PLAN §11.2 step 1). */
export function stepExtractors(world: World): void {
  const rate = currentExtractorRate(world.state);
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'extractor' || b.extractValue === undefined) continue;
    let acc = (b.extractAcc ?? 0) + rate * TICK_DT;
    while (acc >= 1 - EPS) {
      if (!pushFromPorts(world, b, b.extractValue)) {
        acc = Math.min(acc, 1);
        break;
      }
      acc -= 1;
    }
    b.extractAcc = Math.max(0, acc);
  }
}

/** Number of output faces with a belt that can receive from this extractor. */
export function connectedOutputs(world: World, b: Building): number {
  let n = 0;
  for (const p of world.buildingPorts.get(b.id) ?? []) {
    if (p.kind === 'out' && resolveTarget(world, p.x, p.y, p.face).kind === 'belt') n++;
  }
  return n;
}
