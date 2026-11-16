import { TICK_DT } from '../config/balance';
import { key } from '../core/grid';
import { EPS, offer, resolveTarget, type Target } from './belts';
import type { Building, PortFace, PortKind } from './entities';
import { currentBeltSpeed } from './upgrades';
import type { World } from './world';

/** Output faces of one kind of a building, with what each one leads into. */
export interface OutputGroup {
  ports: PortFace[];
  /** Port key (tile key × 4 + face) of each port. */
  keys: number[];
  targets: Target[];
}

const KIND_INDEX: Record<PortKind, number> = {
  A: 0,
  B: 1,
  O: 2,
  Q: 3,
  R: 4,
  in: 5,
  out: 6,
  dynamic: 7,
};

/**
 * Faces of `kind` of a building and their targets, cached until the next structural change
 * (the world clears the cache whenever the network is invalidated).
 */
export function outputGroup(world: World, b: Building, kind: PortKind): OutputGroup {
  const id = b.id * 8 + KIND_INDEX[kind];
  let g = world.outputGroups.get(id);
  if (!g) {
    const ports = (world.buildingPorts.get(b.id) ?? []).filter((p) => p.kind === kind);
    g = {
      ports,
      keys: ports.map((p) => key(p.x, p.y) * 4 + p.face),
      targets: ports.map((p) => resolveTarget(world, p.x, p.y, p.face)),
    };
    world.outputGroups.set(id, g);
  }
  return g;
}

/**
 * Push one item out of a building through its `kind` output faces, round-robin among
 * connected faces that can accept (PLAN §6.3, §6.4). Belts must not point back at the
 * building. Direct links to another building's input face transfer at most one item per
 * tick and no faster than the belt speed (PLAN §6.4).
 */
export function pushOut(world: World, b: Building, kind: PortKind, value: number): boolean {
  const g = outputGroup(world, b, kind);
  const n = g.ports.length;
  if (n === 0) return false;
  const { state } = world;
  // Priority face first (PLAN §6.6), then round-robin over the others.
  const prio = b.priority === null ? -1 : g.keys.indexOf(b.priority);
  for (let i = -1; i < n; i++) {
    if (i === -1 && prio < 0) continue;
    const idx = i === -1 ? prio : (b.rrOut + i) % n;
    if (i >= 0 && idx === prio) continue;
    const target = g.targets[idx];
    if (!target || target.kind === 'none' || target.kind === 'blocked') continue;
    if (target.kind !== 'belt') {
      const pk = g.keys[idx] as number;
      const interval = 1 / (currentBeltSpeed(state) * TICK_DT);
      const last = world.directTransfers.get(pk);
      if (last !== undefined && state.tick - last < interval - EPS) continue;
      if (!offer(world, target, value, 0, null)) continue;
      world.directTransfers.set(pk, state.tick);
    } else if (!offer(world, target, value, 0, null)) {
      continue;
    }
    if (idx !== prio) b.rrOut = (idx + 1) % n;
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
