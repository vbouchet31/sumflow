import type { Reward } from '../config/balance';
import { rewardFor } from './levels';
import { type GameState, requirementFor } from './state';

export type ProgressionEvents = {
  delivered: { value: number };
  levelCompleted: { level: number; reward: Reward | null; final: boolean };
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
  if (req && req.value === value && req.delivered < req.required) {
    req.delivered += 1;
    if (req.delivered >= req.required) completeLevel(state, emit);
  }
}

/** Apply a level reward (PLAN §7.2, §7.4). Idempotent. */
export function applyReward(state: GameState, reward: Reward | null): void {
  if (!reward) return;
  switch (reward.kind) {
    case 'extraction':
      state.maxExtraction = Math.max(state.maxExtraction, reward.max);
      break;
    case 'building':
      if (!state.unlockedBuildings.includes(reward.building))
        state.unlockedBuildings.push(reward.building);
      break;
    case 'feature':
      if (!state.unlockedFeatures.includes(reward.feature))
        state.unlockedFeatures.push(reward.feature);
      break;
  }
}

/** Finish the current level: reward, then next level or end of the game (free play). */
export function completeLevel(state: GameState, emit?: Emit): void {
  const done = state.level;
  const def = state.levels[done - 1];
  const reward = rewardFor(done);
  applyReward(state, reward);
  const final = def?.final ?? false;
  if (final) {
    state.levelRequirement = null;
    state.finishedAtTick = state.tick;
  } else {
    state.level = done + 1;
    state.levelRequirement = requirementFor(state, state.level);
  }
  emit?.('levelCompleted', { level: done, reward, final });
}

/** Debug: jump to `level`, granting every reward of the levels before it. */
export function setLevel(state: GameState, level: number): void {
  const target = Math.max(1, Math.floor(level));
  for (let n = 1; n < target; n++) applyReward(state, rewardFor(n));
  state.level = target;
  state.finishedAtTick = null;
  state.levelRequirement = requirementFor(state, target);
}
