import { HUB, LEVEL_TABLE, type Reward, START_MAX_EXTRACTION, type Track } from '../config/balance';
import { toSeed } from '../core/rng';
import type { Belt, Building } from './entities';

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
  /** Upgrade level per track (1 = initial). */
  upgrades: Record<Track, number>;
  /** Belts by tile key. */
  belts: Map<number, Belt>;
  /** Buildings by id. The hub is id 0. */
  buildings: Map<number, Building>;
  nextBuildingId: number;
  /** Total items delivered to the hub, all values. */
  totalDelivered: number;
}

export const HUB_ID = 0;

/** Fresh game state with the hub in place. Randomised targets and rewards arrive in M4. */
export function createInitialState(seed: number): GameState {
  const first = LEVEL_TABLE[0];
  if (!first) throw new Error('LEVEL_TABLE is empty');
  const buildings = new Map<number, Building>();
  buildings.set(HUB_ID, {
    id: HUB_ID,
    type: 'hub',
    x: HUB.x,
    y: HUB.y,
    rot: 0,
    rrOut: 0,
    priority: null,
  });
  return {
    seed: toSeed(seed),
    tick: 0,
    level: 1,
    maxExtraction: START_MAX_EXTRACTION,
    levelRequirement: { value: first.target, required: first.quantity, delivered: 0 },
    nextReward: first.reward,
    upgrades: { belt: 1, extractor: 1, adder: 1, multiplier: 1, subdiv: 1, exponent: 1 },
    belts: new Map(),
    buildings,
    nextBuildingId: HUB_ID + 1,
    totalDelivered: 0,
  };
}
