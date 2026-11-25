import { OUTPUT_BUFFER_SIZE, operatorSpeed, TICK_DT } from '../config/balance';
import { PASSIVE_EFFECTS, type SpecialEdition } from '../config/cards';
import { operationOf, trackOf } from '../config/buildings';
import type { OperationResult } from '../config/operations';
import { EPS } from './belts';
import { type Building, isOperator, type OperatorType, OUTPUT_BUFFER } from './entities';
import { editionEffect } from './inventory';
import { outputGroup, pushOut } from './outputs';
import type { GameState } from './state';
import type { World } from './world';

/** Result(s) of one cycle of `type`, from the operations registry (`config/operations.ts`). */
export function compute(type: OperatorType, a: number, b: number): OperationResult {
  return operationOf(type).compute(a, b);
}

/**
 * Seconds per operation of an operator: its track's upgrade level, the passives and its own
 * edition (PLAN-recompenses §3.4), all speed factors multiplied.
 */
export function cycleDuration(
  world: World,
  b: { type: OperatorType; edition?: SpecialEdition | undefined },
): number {
  const track = trackOf(b.type);
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

/** Both inputs hold an item and every output port of the operation has room. */
function canStart(b: Building, type: OperatorType): boolean {
  if (!b.inA?.length || !b.inB?.length) return false;
  for (const port of operationOf(type).outputs) {
    if (!hasRoom(b[OUTPUT_BUFFER[port]])) return false;
  }
  return true;
}

function finishCycle(world: World, b: Building, type: OperatorType): void {
  const a = b.inA?.shift();
  const c = b.inB?.shift();
  if (a === undefined || c === undefined) return;
  const op = operationOf(type);
  const res = op.compute(a, c);
  for (const port of op.outputs) {
    const v = res[port];
    if (v !== undefined) b[OUTPUT_BUFFER[port]]?.push(v);
  }
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
      if (!canStart(b, type)) continue;
      cycle = cycleDuration(world, { type, edition: b.edition });
    }
    cycle -= TICK_DT;
    while (cycle <= EPS) {
      finishCycle(world, b, type);
      if (!canStart(b, type)) {
        cycle = -1;
        break;
      }
      cycle += cycleDuration(world, { type, edition: b.edition });
    }
    b.cycle = cycle;
  }
}
