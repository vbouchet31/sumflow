import { LEVEL_TABLE, type Reward } from '../config/balance';

export interface Requirement {
  value: number;
  required: number;
  delivered: number;
}

export interface GameState {
  tick: number;
  level: number;
  levelRequirement: Requirement;
  nextReward: Reward | null;
}

/** Fresh game state. Progression logic (randomised targets, rewards) arrives in M4. */
export function createInitialState(): GameState {
  const first = LEVEL_TABLE[0];
  if (!first) throw new Error('LEVEL_TABLE is empty');
  return {
    tick: 0,
    level: 1,
    levelRequirement: { value: first.target, required: first.quantity, delivered: 0 },
    nextReward: first.reward,
  };
}
