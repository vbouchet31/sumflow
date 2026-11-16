import { LEVEL_TABLE } from '../config/balance';
import type { GameState } from './state';

export type ProgressionEvents = {
  delivered: { value: number };
  levelCompleted: { level: number };
};

export type Emit = <K extends keyof ProgressionEvents>(
  type: K,
  payload: ProgressionEvents[K],
) => void;

/**
 * Count one item of `value` delivered to the hub (PLAN §7.1). Every active, incomplete
 * requirement of that value advances. Upgrade requirements arrive in M7.
 */
export function deliver(state: GameState, value: number, emit?: Emit): void {
  state.totalDelivered += 1;
  emit?.('delivered', { value });
  const req = state.levelRequirement;
  if (req.value === value && req.delivered < req.required) {
    req.delivered += 1;
    if (req.delivered >= req.required) completeLevel(state, emit);
  }
}

/**
 * Minimal level advance for M3: move to the next level of the base table.
 * Rewards, randomised targets and infinite levels arrive in M4.
 */
export function completeLevel(state: GameState, emit?: Emit): void {
  const done = state.level;
  state.level += 1;
  const def = LEVEL_TABLE[state.level - 1] ?? LEVEL_TABLE[LEVEL_TABLE.length - 1];
  if (def) {
    state.levelRequirement = { value: def.target, required: def.quantity, delivered: 0 };
    state.nextReward = def.reward;
  }
  emit?.('levelCompleted', { level: done });
}
