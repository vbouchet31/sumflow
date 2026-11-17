import { type Reward, type Track, TRACKS } from '../config/balance';
import { deliverToContract } from './contracts';
import { rewardFor } from './levels';
import { type GameState, requirementFor } from './state';
import { buyUpgrade, isUpgradeReady, syncUpgradeRequirements } from './upgrades';

export type ProgressionEvents = {
  delivered: { value: number };
  levelCompleted: { level: number; reward: Reward | null; final: boolean };
  upgradeReady: { track: Track };
  upgradeBought: { track: Track; level: number };
  contractOffered: { value: number; required: number };
  contractCompleted: { value: number };
  contractExpired: { value: number };
};

export type Emit = <K extends keyof ProgressionEvents>(
  type: K,
  payload: ProgressionEvents[K],
) => void;

/**
 * Count one item of `value` delivered to the hub (PLAN §7.1). Every active, incomplete
 * requirement of that value advances: the level's and each track's next upgrade. One item
 * can therefore count several times; items beyond a requirement are lost.
 */
export function deliver(state: GameState, value: number, emit?: Emit): void {
  state.totalDelivered += 1;
  emit?.('delivered', { value });
  for (const track of TRACKS) {
    const reqs = state.upgradeReqs[track];
    let hit = false;
    for (const r of reqs) {
      if (r.value === value && r.delivered < r.required) {
        r.delivered += 1;
        hit = true;
      }
    }
    if (hit && isUpgradeReady(state, track)) {
      emit?.('upgradeReady', { track });
      if (state.autoBuyUpgrades) purchase(state, track, emit);
    }
  }
  deliverToContract(state, value, emit);
  const req = state.levelRequirement;
  if (req && req.value === value && req.delivered < req.required) {
    req.delivered += 1;
    if (req.delivered >= req.required) completeLevel(state, emit);
  }
}

/** Buy an upgrade (manual button or auto-buy). Effects are immediate (PLAN §7.3). */
export function purchase(state: GameState, track: Track, emit?: Emit): boolean {
  if (!buyUpgrade(state, track)) return false;
  emit?.('upgradeBought', { track, level: state.upgrades[track] });
  // The new window may already be complete only if it is empty; nothing else to do.
  return true;
}

/** Turning auto-buy on buys everything already ready. */
export function setAutoBuy(state: GameState, on: boolean, emit?: Emit): void {
  state.autoBuyUpgrades = on;
  if (!on) return;
  for (const track of TRACKS) if (isUpgradeReady(state, track)) purchase(state, track, emit);
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
  syncUpgradeRequirements(state);
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
