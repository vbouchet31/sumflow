import { OUTPUT_BUFFER_SIZE, operatorSpeed, TICK_DT, type Track } from '../config/balance';
import { add, divmod, mul, pow, sub } from '../core/intmath';
import { EPS } from './belts';
import { currentBeltSpeed } from './upgrades';

/** Numbers per total of a new totalizer (proposal 16). */
export const TOTALIZER_DEFAULT = 3;
import { type Building, isOperator, type OperatorType } from './entities';
import { outputGroup, pushOut } from './outputs';
import type { World } from './world';

/** Upgrade track driving each operator's speed (PLAN §7.3). */
export const OPERATOR_TRACK: Record<OperatorType, Track> = {
  adder: 'adder',
  multiplier: 'multiplier',
  subtractor: 'subdiv',
  divider: 'subdiv',
  exponent: 'exponent',
  totalizer: 'adder',
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
    case 'totalizer':
      // Handled in `finishCycle` (it needs several inputs); here: one step of the sum.
      return { o: add(a, b) };
    case 'divider': {
      const { q, r } = divmod(a, b);
      return r === 0 ? { q } : { q, r };
    }
  }
}

/** Seconds per operation for a building, from its track's upgrade level. */
export function cycleDuration(world: World, type: OperatorType): number {
  // The totalizer only adds: it keeps pace with the belts.
  if (type === 'totalizer') return 1 / currentBeltSpeed(world.state);
  const track = OPERATOR_TRACK[type];
  return 1 / operatorSpeed(track, world.state.upgrades[track]);
}

function hasRoom(buf: number[] | undefined): boolean {
  return buf !== undefined && buf.length < OUTPUT_BUFFER_SIZE;
}

function canStart(b: Building): boolean {
  if (b.type === 'totalizer') return (b.inA?.length ?? 0) > 0 && hasRoom(b.out);
  if (!b.inA?.length || !b.inB?.length) return false;
  if (b.type === 'divider') return hasRoom(b.outQ) && hasRoom(b.outR);
  return hasRoom(b.out);
}

function finishCycle(world: World, b: Building, type: OperatorType): void {
  if (type === 'totalizer') {
    const v = b.inA?.shift();
    if (v === undefined) return;
    b.acc = add(b.acc ?? 0, v);
    b.accN = (b.accN ?? 0) + 1;
    if (b.accN >= (b.size ?? TOTALIZER_DEFAULT)) {
      b.out?.push(b.acc);
      b.acc = 0;
      b.accN = 0;
      b.flashTick = world.state.tick;
    }
    return;
  }
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
      cycle = cycleDuration(world, type);
    }
    cycle -= TICK_DT;
    while (cycle <= EPS) {
      finishCycle(world, b, type);
      if (!canStart(b)) {
        cycle = -1;
        break;
      }
      cycle += cycleDuration(world, type);
    }
    b.cycle = cycle;
  }
}
