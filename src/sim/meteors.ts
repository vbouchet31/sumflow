import { METEORS, MAPGEN, TICK_RATE } from '../config/balance';
import { hash2, mulberry32 } from '../core/rng';
import { type Deposit, depositContains, depositsConflict } from '../world/deposits';
import type { Emit } from './progression';
import type { World } from './world';

/** A temporary 3×3 deposit (proposal 13). Same shape as a deposit, plus an id and an end. */
export interface Meteor extends Deposit {
  id: number;
  endsAt: number;
}

export interface MeteorState {
  /** Meteorites on the map (at most one in practice). */
  active: Meteor[];
  /** Tick of the next fall; -1 = not scheduled yet. */
  nextAt: number;
  /** Meteorites fallen so far (seeds the next draw). */
  count: number;
}

export function initialMeteors(): MeteorState {
  return { active: [], nextAt: -1, count: 0 };
}

const METEOR_SALT = 0x4d455445; // "METE"

/** The meteorite covering tile (x, y), if any. */
export function meteorAt(world: World, x: number, y: number): Meteor | null {
  for (const m of world.state.meteors.active) if (depositContains(m, x, y)) return m;
  return null;
}

/** Can meteorite `m` land: no deposit nearby, no building under it, outside the hub zone? */
function canLand(world: World, m: Deposit): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = world.deposits.depositAt(m.x + dx, m.y + dy);
      if (d && depositsConflict(d, m)) return false;
    }
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = m.x + dx;
      const y = m.y + dy;
      if (world.buildingAt(x, y) || world.beltAt(x, y) || world.bridgeAt(x, y)) return false;
    }
  }
  return true;
}

/** Draw meteorite number `index` (seeded: the same game gets the same sky). */
export function drawMeteor(world: World, index: number): Meteor | null {
  const { state } = world;
  const rng = mulberry32(hash2(state.seed, METEOR_SALT, index));
  const lo = state.maxExtraction + METEORS.minAbove;
  const hi = state.maxExtraction * METEORS.maxFactor + METEORS.minAbove;
  let value = lo + Math.floor(rng() * (hi - lo + 1));
  if (value === MAPGEN.forbiddenValue) value += 1;
  for (let i = 0; i < METEORS.attempts; i++) {
    const a = rng() * Math.PI * 2;
    const r = METEORS.minDistance + rng() * (METEORS.maxDistance - METEORS.minDistance);
    const m = {
      id: index,
      x: Math.round(Math.cos(a) * r),
      y: Math.round(Math.sin(a) * r),
      value,
      endsAt: state.tick + METEORS.lifetime * TICK_RATE,
    };
    if (canLand(world, m)) return m;
  }
  return null;
}

/** Once per tick: meteorites fade, and the next one falls on schedule. */
export function stepMeteors(world: World, emit?: Emit): void {
  const { state } = world;
  const ms = state.meteors;
  if (ms.active.length > 0) {
    const gone = ms.active.filter((m) => state.tick >= m.endsAt);
    if (gone.length > 0) {
      ms.active = ms.active.filter((m) => state.tick < m.endsAt);
      for (const m of gone) emit?.('meteorFaded', { value: m.value });
      ms.nextAt = state.tick + METEORS.interval * TICK_RATE;
    }
    return;
  }
  if (state.level < METEORS.fromLevel) return;
  if (ms.nextAt < 0) ms.nextAt = state.tick + METEORS.firstDelay * TICK_RATE;
  if (state.tick < ms.nextAt) return;
  ms.count += 1;
  const m = drawMeteor(world, ms.count);
  if (!m) {
    ms.nextAt = state.tick + METEORS.interval * TICK_RATE;
    return;
  }
  ms.active.push(m);
  emit?.('meteorFell', { value: m.value, x: m.x, y: m.y });
}
