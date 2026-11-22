import { OUTPUT_BUFFER_SIZE, operatorSpeed, TICK_DT, type Track } from '../config/balance';
import { PASSIVE_EFFECTS, type SpecialEdition } from '../config/cards';
import { add, divmod, mul, pow, sub } from '../core/intmath';
import { EPS } from './belts';
import { type Building, isOperator, type OperatorType } from './entities';
import { editionEffect } from './inventory';
import { outputGroup, pushOut } from './outputs';
import type { GameState } from './state';
import type { World } from './world';

/** Upgrade track driving each operator's speed (PLAN §7.3). */
export const OPERATOR_TRACK: Record<OperatorType, Track> = {
  adder: 'adder',
  multiplier: 'multiplier',
  subtractor: 'subdiv',
  divider: 'subdiv',
  exponent: 'exponent',
};

/** Result(s) of one operation. The divider emits R only when non-zero (PLAN §6.3). */
export function compute(
  type: OperatorType,
  a: number,
  b: number,
): { o?: number; q?: number; r?: number } {
  switch (type) {
    case 'adder':
      return { o: add(a, b) };
    case 'multiplier':
      return { o: mul(a, b) };
    case 'subtractor':
      return { o: sub(a, b) };
    case 'exponent':
      return { o: pow(a, b) };
    case 'divider': {
      const { q, r } = divmod(a, b);
      return r === 0 ? { q } : { q, r };
    }
  }
}

/**
 * Seconds per operation of an operator: its track's upgrade level, the passives and its own
 * edition (PLAN-recompenses §3.4), all speed factors multiplied.
 */
export function cycleDuration(
  world: World,
  b: { type: OperatorType; edition?: SpecialEdition | undefined },
): number {
  const track = OPERATOR_TRACK[b.type];
  const speed = operatorSpeed(track, world.state.upgrades[track]) * passiveSpeed(world.state);
  return 1 / (speed * (editionEffect(b).speed ?? 1));
}

/** Operator speed factor of the passive cards owned (PLAN-recompenses §5.3, placeholder). */
export function passiveSpeed(state: GameState): number {
  let factor = 1;
  for (const id of state.passives) factor *= PASSIVE_EFFECTS[id].operatorSpeed;
  return factor;
}

function hasRoom(buf: number[] | undefined): boolean {
  return buf !== undefined && buf.length < OUTPUT_BUFFER_SIZE;
}

function canStart(b: Building): boolean {
  if (!b.inA?.length || !b.inB?.length) return false;
  if (b.type === 'divider') return hasRoom(b.outQ) && hasRoom(b.outR);
  return hasRoom(b.out);
}

function finishCycle(world: World, b: Building, type: OperatorType): void {
  const a = b.inA?.shift();
  const c = b.inB?.shift();
  if (a === undefined || c === undefined) return;
  const res = compute(type, a, c);
  if (res.o !== undefined) b.out?.push(res.o);
  if (res.q !== undefined) b.outQ?.push(res.q);
  if (res.r !== undefined) b.outR?.push(res.r);
  b.flashTick = world.state.tick;
}

/** Step 3 of the tick: buildings empty their output buffers (PLAN §11.2). */
export function stepOutputs(world: World): void {
  for (const b of world.state.buildings.values()) {
    if (!isOperator(b.type)) continue;
    drain(world, b, b.out, 'O');
    drain(world, b, b.outQ, 'Q');
    drain(world, b, b.outR, 'R');
  }
}

function drain(world: World, b: Building, buf: number[] | undefined, kind: 'O' | 'Q' | 'R'): void {
  if (!buf || buf.length === 0) return;
  // Each face takes at most one item per tick: try as many times as there are faces.
  const faces = outputGroup(world, b, kind).ports.length;
  for (let i = 0; i < faces && buf.length > 0; i++) {
    const value = buf[0];
    if (value === undefined || !pushOut(world, b, kind, value)) break;
    buf.shift();
  }
}

/**
 * Step 4: operators advance their cycle (PLAN §6.2). A cycle starts when both inputs hold
 * an item and the output(s) have room; at its end one A and one B are consumed and the
 * result pushed. Leftover time carries into the next cycle so the cadence stays exact.
 */
export function stepOperators(world: World): void {
  for (const b of world.state.buildings.values()) {
    if (!isOperator(b.type)) continue;
    const type = b.type;
    let cycle = b.cycle ?? -1;
    if (cycle < 0) {
      if (!canStart(b)) continue;
      cycle = cycleDuration(world, { type, edition: b.edition });
    }
    cycle -= TICK_DT;
    while (cycle <= EPS) {
      finishCycle(world, b, type);
      if (!canStart(b)) {
        cycle = -1;
        break;
      }
      cycle += cycleDuration(world, { type, edition: b.edition });
    }
    b.cycle = cycle;
  }
}
