import { LEVEL_TABLE, type Reward, START_MAX_EXTRACTION } from '../config/balance';
import { toSeed } from '../core/rng';

export interface Requirement {
  value: number;
  required: number;
  delivered: number;
}

export interface GameState {
  /** 32-bit game seed: the whole map derives from it (PLAN §4.4). */
  seed: number;
  tick: number;
  level: number;
  /** Highest extractable value (10 is never extractable). PLAN §4.5. */
  maxExtraction: number;
  levelRequirement: Requirement;
  nextReward: Reward | null;
}

/** Fresh game state. Progression logic (randomised targets, rewards) arrives in M4. */
export function createInitialState(seed: number): GameState {
  const first = LEVEL_TABLE[0];
  if (!first) throw new Error('LEVEL_TABLE is empty');
  return {
    seed: toSeed(seed),
    tick: 0,
    level: 1,
    maxExtraction: START_MAX_EXTRACTION,
    levelRequirement: { value: first.target, required: first.quantity, delivered: 0 },
    nextReward: first.reward,
  };
}
