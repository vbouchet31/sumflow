import { TICK_DT } from '../config/balance';
import { key } from '../core/grid';
import { EPS, offer, resolveTarget } from './belts';
import type { Building, PortKind } from './entities';
import { currentBeltSpeed } from './upgrades';
import type { World } from './world';

/**
 * Push one item out of a building through its `kind` output faces, round-robin among
 * connected faces that can accept (PLAN §6.3, §6.4). Belts must not point back at the
 * building. Direct links to another building's input face transfer at most one item per
 * tick and no faster than the belt speed (PLAN §6.4).
 */
export function pushOut(world: World, b: Building, kind: PortKind, value: number): boolean {
  const ports = (world.buildingPorts.get(b.id) ?? []).filter((p) => p.kind === kind);
  const n = ports.length;
  if (n === 0) return false;
  const { state } = world;
  const interval = 1 / (currentBeltSpeed(state) * TICK_DT);
  for (let i = 0; i < n; i++) {
    const idx = (b.rrOut + i) % n;
    const p = ports[idx];
    if (!p) continue;
    const target = resolveTarget(world, p.x, p.y, p.face);
    if (target.kind === 'none' || target.kind === 'blocked') continue;
    if (target.kind !== 'belt') {
      const pk = key(p.x, p.y) * 4 + p.face;
      const last = world.directTransfers.get(pk);
      if (last !== undefined && state.tick - last < interval - EPS) continue;
      if (!offer(world, target, value, 0, null)) continue;
      world.directTransfers.set(pk, state.tick);
    } else if (!offer(world, target, value, 0, null)) {
      continue;
    }
    b.rrOut = (idx + 1) % n;
    return true;
  }
  return false;
}

/** Number of output faces of `kind` that lead somewhere (a belt or an input). */
export function connectedOutputs(world: World, b: Building, kind: PortKind = 'out'): number {
  let n = 0;
  for (const p of world.buildingPorts.get(b.id) ?? []) {
    if (p.kind !== kind) continue;
    const t = resolveTarget(world, p.x, p.y, p.face).kind;
    if (t !== 'none' && t !== 'blocked') n++;
  }
  return n;
}
