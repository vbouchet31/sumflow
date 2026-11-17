import { INPUT_BUFFER_SIZE, STORAGE_CAPACITY, TICK_DT } from '../config/balance';
import { type Dir, DX, DY, key, opposite } from '../core/grid';
import {
  axisOf,
  type Belt,
  type Building,
  hasOutput,
  isInputKind,
  type PortKind,
} from './entities';
import { fuelBeacon } from './beacon';
import { deliver } from './progression';
import { currentBeltSpeed } from './upgrades';
import type { World } from './world';

/** Tolerance for float accumulation (1/60 summed 60 times is not exactly 1). */
export const EPS = 1e-9;

/** What a belt output (or building output face) leads into. */
export type Target =
  | { kind: 'belt'; belt: Belt; node: number; from: Dir }
  | { kind: 'hub' }
  | { kind: 'storage'; building: Building }
  | { kind: 'beacon'; building: Building }
  | { kind: 'port'; building: Building; port: PortKind; face: number }
  | { kind: 'none' }
  | { kind: 'blocked' };

/**
 * Resolve the target of something at `(x, y)` pushing in direction `d`.
 * - `none`: nothing accepts on that side (no belt, or a building face without an input).
 * - `blocked`: a belt that points back at us (head-on).
 */
export function resolveTarget(world: World, x: number, y: number, d: Dir): Target {
  const nx = x + DX[d];
  const ny = y + DY[d];
  const lane = world.laneAt(nx, ny, axisOf(d));
  if (lane) {
    return hasOutput(lane.belt, opposite(d))
      ? { kind: 'blocked' }
      : { kind: 'belt', belt: lane.belt, node: lane.node, from: opposite(d) };
  }
  // A bridge without a lane on this axis accepts nothing.
  if (world.bridgeAt(nx, ny)) return { kind: 'none' };
  const ref = world.portAt(nx, ny, opposite(d));
  // Storage faces are inputs for whatever pushes into them (PLAN §6.3).
  if (ref && ref.port.kind === 'dynamic' && ref.building.type === 'storage') {
    return { kind: 'storage', building: ref.building };
  }
  if (ref && isInputKind(ref.port.kind)) {
    if (ref.building.type === 'hub') return { kind: 'hub' };
    if (ref.building.type === 'beacon') return { kind: 'beacon', building: ref.building };
    return {
      kind: 'port',
      building: ref.building,
      port: ref.port.kind,
      face: key(nx, ny) * 4 + opposite(d),
    };
  }
  return { kind: 'none' };
}

/**
 * Put one item in a storage: the first value received while empty fixes it, other values
 * are refused (the incoming belt waits), up to 10 000 items (PLAN §6.3).
 */
export function storeItem(b: Building, value: number): boolean {
  const count = b.storeCount ?? 0;
  if (count >= STORAGE_CAPACITY) return false;
  if (count > 0 && b.storeValue !== value) return false;
  b.storeValue = value;
  b.storeCount = count + 1;
  return true;
}

/** Input buffer of an operator for a port kind. */
export function inputBuffer(b: Building, port: PortKind): number[] | undefined {
  return port === 'A' ? b.inA : port === 'B' ? b.inB : undefined;
}

/** Is `src` holding an item that will want to leave this tick? */
function isReady(src: Belt, tick: number, step: number): boolean {
  if (!src.item) return false;
  const pending = src.item.stamp === tick ? 0 : step;
  return src.item.progress + pending >= 1 - EPS;
}

/**
 * Try to hand an item over to `target`. Merge fairness: a belt with several incoming
 * neighbours accepts them in round-robin among those that have an item ready (PLAN §6.4).
 */
export function offer(
  world: World,
  target: Target,
  value: number,
  carry: number,
  sourceKey: number | null,
): boolean {
  const { state } = world;
  switch (target.kind) {
    case 'hub':
      deliver(state, value, world.emit);
      return true;
    case 'storage':
      return storeItem(target.building, value);
    case 'beacon':
      return fuelBeacon(target.building);
    case 'port': {
      const buf = inputBuffer(target.building, target.port);
      if (!buf || buf.length >= INPUT_BUFFER_SIZE) return false;
      buf.push(value);
      return true;
    }
    case 'belt': {
      const t = target.belt;
      if (t.item) return false;
      const inputs = world.getNetwork().inputs.get(target.node);
      if (inputs && inputs.length > 1 && sourceKey !== null) {
        const step = currentBeltSpeed(state) * TICK_DT;
        const turn = t.rrIn % inputs.length;
        const designated = inputs[turn];
        if (designated !== sourceKey && designated !== undefined) {
          const d = world.nodeBelt(designated);
          if (d && isReady(d, state.tick, step)) return false;
        }
        const idx = inputs.indexOf(sourceKey);
        if (idx >= 0) t.rrIn = (idx + 1) % inputs.length;
      }
      // Items handed over by a belt already moved this tick. Items from buildings (which run
      // before belts in the tick) still get this tick's belt movement, and start where the
      // previous item would have left them, so a full belt keeps exact spacing.
      let progress = carry;
      let stamp = state.tick;
      if (sourceKey === null) {
        stamp = state.tick - 1;
        if (t.vacatedTick === state.tick - 1) progress = Math.max(progress, t.vacatedCarry);
      }
      t.item = { value, progress: Math.min(progress, 1), from: target.from, stamp };
      return true;
    }
    default:
      return false;
  }
}

/** Output directions of a belt in try order: priority first, then round-robin from `rr`. */
function outputOrder(belt: Belt): Dir[] {
  const order: Dir[] = [];
  if (belt.priority !== null && hasOutput(belt, belt.priority)) order.push(belt.priority);
  for (let i = 0; i < 4; i++) {
    const d = ((belt.rr + i) & 3) as Dir;
    if (d !== belt.priority && hasOutput(belt, d)) order.push(d);
  }
  return order;
}

/**
 * Advance every belt, downstream first (PLAN §6.4, §11.2 step 2). Outputs are tried
 * priority first, then round-robin from `rr`; their targets come from the network cache.
 */
export function stepBelts(world: World): void {
  const net = world.getNetwork();
  const { order, belts, targets } = net;
  const tick = world.state.tick;
  const step = currentBeltSpeed(world.state) * TICK_DT;
  for (let n = 0; n < belts.length; n++) {
    const belt = belts[n] as Belt;
    const item = belt.item;
    if (!item) continue;
    if (item.stamp === tick) continue; // already moved this tick (arrived from upstream)
    item.stamp = tick;
    item.progress += step;
    if (item.progress < 1 - EPS) continue;
    const carry = Math.max(0, item.progress - 1);
    const prio = belt.priority !== null && hasOutput(belt, belt.priority) ? belt.priority : -1;
    let moved = false;
    for (let i = -1; i < 4 && !moved; i++) {
      let d: Dir;
      if (i === -1) {
        if (prio < 0) continue;
        d = prio as Dir;
      } else {
        d = ((belt.rr + i) & 3) as Dir;
        if (d === prio || !hasOutput(belt, d)) continue;
      }
      const target = (targets[n * 4 + d] ??= resolveTarget(world, belt.x, belt.y, d));
      if (target.kind === 'none' || target.kind === 'blocked') continue;
      if (!offer(world, target, item.value, carry, order[n] as number)) continue;
      belt.item = null;
      belt.vacatedTick = tick;
      belt.vacatedCarry = carry;
      if (d !== prio) belt.rr = (d + 1) & 3;
      moved = true;
    }
    if (!moved) item.progress = 1;
  }
}

/** Why a belt's item cannot leave, for the tooltip. */
export function beltStatus(world: World, belt: Belt): 'moving' | 'empty' | 'noInput' | 'waiting' {
  if (!belt.item) return 'empty';
  if (belt.item.progress < 1 - EPS) return 'moving';
  for (const d of outputOrder(belt)) {
    if (resolveTarget(world, belt.x, belt.y, d).kind !== 'none') return 'waiting';
  }
  return 'noInput';
}
