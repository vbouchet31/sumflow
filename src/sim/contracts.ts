import { CONTRACTS, MAPGEN, TICK_RATE } from '../config/balance';
import { hash2, mulberry32 } from '../core/rng';
import type { Emit } from './progression';
import type { GameState } from './state';

/** An optional timed order from the hub (proposal 04). */
export interface Contract {
  /** 1 for the first contract of the game, then 2, 3… (seeds the draw). */
  index: number;
  value: number;
  required: number;
  delivered: number;
  /** Tick at which the contract expires. */
  endsAt: number;
}

/** Contract bookkeeping kept in the save. */
export interface ContractState {
  current: Contract | null;
  /** Tick at which the next contract is offered (when none is running). */
  nextAt: number;
  /** Boost (reward) active until this tick. */
  boostUntil: number;
  completed: number;
  failed: number;
}

export function initialContracts(): ContractState {
  return { current: null, nextAt: -1, boostUntil: 0, completed: 0, failed: 0 };
}

const CONTRACT_SALT = 0x434f4e54; // "CONT"

/** Contract number `index`, drawn from the seed only (same game, same contracts). */
export function drawContract(state: GameState, index: number): Contract {
  const rng = mulberry32(hash2(state.seed, CONTRACT_SALT, index));
  const span = Math.max(CONTRACTS.minSpan, CONTRACTS.valueFactor * state.maxExtraction);
  let value = 2 + Math.floor(rng() * (span - 1));
  const target = state.levelRequirement?.value;
  if (value === target || value === MAPGEN.forbiddenValue) value += 1;
  if (value === target) value += 1;
  const q = CONTRACTS.quantityBase + CONTRACTS.quantityStep * state.level;
  const required = Math.min(CONTRACTS.quantityMax, Math.round(q / 5) * 5);
  return {
    index,
    value,
    required,
    delivered: 0,
    endsAt: state.tick + CONTRACTS.duration * TICK_RATE,
  };
}

/** Speed multiplier from an active contract reward (1 when none). */
export function boostFactor(state: GameState): number {
  return state.contracts.boostUntil > state.tick ? CONTRACTS.boostFactor : 1;
}

/** Seconds left on a tick deadline (never negative). */
export function secondsUntil(state: GameState, tick: number): number {
  return Math.max(0, (tick - state.tick) / TICK_RATE);
}

/** Once per tick: offer, expire. Contracts wait for `fromLevel`. */
export function stepContracts(state: GameState, emit?: Emit): void {
  const c = state.contracts;
  if (state.level < CONTRACTS.fromLevel || state.levelRequirement === null) return;
  if (c.nextAt < 0) c.nextAt = state.tick + CONTRACTS.firstDelay * TICK_RATE;
  if (c.current) {
    if (state.tick >= c.current.endsAt) {
      const done = c.current;
      c.current = null;
      c.failed += 1;
      c.nextAt = state.tick + CONTRACTS.cooldown * TICK_RATE;
      emit?.('contractExpired', { value: done.value });
    }
    return;
  }
  if (state.tick >= c.nextAt) {
    c.current = drawContract(state, c.completed + c.failed + 1);
    emit?.('contractOffered', { value: c.current.value, required: c.current.required });
  }
}

/** Count a delivery toward the running contract. */
export function deliverToContract(state: GameState, value: number, emit?: Emit): void {
  const c = state.contracts;
  const cur = c.current;
  if (!cur || cur.value !== value) return;
  cur.delivered += 1;
  if (cur.delivered < cur.required) return;
  c.current = null;
  c.completed += 1;
  c.boostUntil = state.tick + CONTRACTS.boostSeconds * TICK_RATE;
  c.nextAt = state.tick + CONTRACTS.cooldown * TICK_RATE;
  emit?.('contractCompleted', { value });
}
