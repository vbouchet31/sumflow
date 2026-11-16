import { TICK_DT } from '../config/balance';
import { type Dir, DX, DY, key, opposite } from '../core/grid';
import { type Belt, hasOutput, isInputKind } from './entities';
import { deliver } from './progression';
import { currentBeltSpeed } from './upgrades';
import type { World } from './world';

/** Tolerance for float accumulation (1/60 summed 60 times is not exactly 1). */
export const EPS = 1e-9;

/** What a belt output (or building output face) leads into. */
export type Target =
  | { kind: 'belt'; belt: Belt; from: Dir }
  | { kind: 'hub' }
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
  const belt = world.beltAt(nx, ny);
  if (belt)
    return hasOutput(belt, opposite(d))
      ? { kind: 'blocked' }
      : { kind: 'belt', belt, from: opposite(d) };
  const port = world.portAt(nx, ny, opposite(d));
  if (port && isInputKind(port.port.kind) && port.building.type === 'hub') return { kind: 'hub' };
  return { kind: 'none' };
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
    case 'belt': {
      const t = target.belt;
      if (t.item) return false;
      const tk = key(t.x, t.y);
      const inputs = world.getNetwork().inputs.get(tk);
      if (inputs && inputs.length > 1 && sourceKey !== null) {
        const step = currentBeltSpeed(state) * TICK_DT;
        const turn = t.rrIn % inputs.length;
        const designated = inputs[turn];
        if (designated !== sourceKey && designated !== undefined) {
          const d = state.belts.get(designated);
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

/** Move one belt's item forward; returns true if it left the tile. */
function stepBelt(world: World, k: number, belt: Belt, speed: number): void {
  const item = belt.item;
  if (!item) return;
  const tick = world.state.tick;
  if (item.stamp === tick) return; // already moved this tick (arrived from upstream)
  item.stamp = tick;
  item.progress += speed * TICK_DT;
  if (item.progress < 1 - EPS) return;
  const carry = Math.max(0, item.progress - 1);
  for (const d of outputOrder(belt)) {
    const target = resolveTarget(world, belt.x, belt.y, d);
    if (offer(world, target, item.value, carry, k)) {
      belt.item = null;
      belt.vacatedTick = tick;
      belt.vacatedCarry = carry;
      if (d !== belt.priority) belt.rr = (d + 1) & 3;
      return;
    }
  }
  item.progress = 1;
}

/** Advance every belt, downstream first (PLAN §6.4, §11.2 step 2). */
export function stepBelts(world: World): void {
  const speed = currentBeltSpeed(world.state);
  const { belts } = world.state;
  for (const k of world.getNetwork().order) {
    const belt = belts.get(k);
    if (belt) stepBelt(world, k, belt, speed);
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
