/**
 * The tool set of a level, read from the game state (PLAN-objets §3.2): extractable values,
 * operations of the unlocked operators and of the special buildings owned, their speeds with
 * the upgrade schedule, the passives and the editions, and the generic factory capacity.
 * Only config and game functions are read: a new operation, special building, passive or
 * edition effect is picked up without code here.
 */
import {
  beltSpeed,
  extractorCapacity,
  LEVEL_TABLE,
  LEVELS,
  MAPGEN,
  operatorSpeed,
  type Track,
  TRACKS,
  UPGRADE_GEN,
  UPGRADE_SEQUENCES,
} from '../config/balance';
import {
  type BaseOperatorType,
  isSpecial,
  OPERATOR_BUILDINGS,
  operationOf,
  trackOf,
} from '../config/buildings';
import { EDITION_EFFECTS, type Edition, SPECIAL_EDITIONS } from '../config/cards';
import { OPERATION_IDS, type OperationId } from '../config/operations';
import {
  operatorSpeedFactor,
  specialSpeedFactor,
  TUNED,
  type TuningValues,
} from '../config/tuning';
import { passiveSpeed } from '../sim/operators';
import type { GameState } from '../sim/state';
import { COST } from './config';
import type { CostTools, PricedOperation } from './cost';

/** Reference target of level `L` for the upgrade schedule (no seeded jitter). */
export function referenceTarget(level: number): number {
  const L = Math.max(1, Math.floor(level));
  const def = LEVEL_TABLE[L - 1];
  if (def) return def.target;
  const last = LEVEL_TABLE[LEVEL_TABLE.length - 1]?.target ?? 1;
  const g = (LEVELS.infiniteGrowth.min + LEVELS.infiniteGrowth.max) / 2;
  return last * g ** (L - LEVEL_TABLE.length);
}

/** Base term `k` (1-based) of a track's sequence, extended by the mean growth beyond t10. */
function baseTerm(track: Track, k: number): number {
  const seq = UPGRADE_SEQUENCES[track];
  const t = seq[k - 1];
  if (t !== undefined) return t;
  const last = seq[seq.length - 1] ?? 1;
  const g = (UPGRADE_GEN.growth.min + UPGRADE_GEN.growth.max) / 2;
  return last * g ** (k - seq.length);
}

/**
 * Upgrade level of every track at level `L` (COST.upgrades), the same for every strategy:
 * going from upgrade level ℓ to ℓ + 1 needs term ℓ of the sequence (`windowTerms`).
 */
export function scheduledUpgrades(level: number): Record<Track, number> {
  const out = {} as Record<Track, number>;
  const { fromLevel, lag, reach } = COST.upgrades;
  const reachable = level >= fromLevel ? reach * referenceTarget(level - lag) : 0;
  for (const track of TRACKS) {
    let l = 1;
    while (l < 200 && baseTerm(track, l) <= reachable && baseTerm(track, l) <= UPGRADE_GEN.maxTerm)
      l++;
    out[track] = l;
  }
  return out;
}

/** Generic factory capacity at level `L`, in ordinary buildings (COST.factory). */
export function factoryCapacity(level: number): number {
  return COST.factory.base + COST.factory.perLevel * level;
}

/** Extractable values: 1 to `maxExtraction`, without the forbidden value. */
export function extractableValues(maxExtraction: number): number[] {
  const out: number[] = [];
  for (let v = 1; v <= maxExtraction; v++) if (v !== MAPGEN.forbiddenValue) out.push(v);
  return out;
}

/** Operations per second of each operation, ordinary and limited. */
export interface Throughput {
  /** Best ordinary building performing it (ops/s). */
  ordinary: Partial<Record<OperationId, number>>;
  /** All copies of the limited buildings performing it (ops/s). */
  limited: Partial<Record<OperationId, number>>;
  /** Extra generic capacity from the edition cards (in buildings). */
  editionBonus: number;
  /** Items per second of one extractor. */
  extractorRate: number;
}

/** Speeds of the tool set of `state` when playing `level`. */
export function throughputOf(
  state: GameState,
  level: number,
  tuning: TuningValues = TUNED,
): Throughput {
  const up = scheduledUpgrades(level);
  const passive = passiveSpeed(state);
  const speed = (track: Track): number => operatorSpeed(track, up[track]) * passive;
  const ordinary: Partial<Record<OperationId, number>> = {};
  let editionBonus = 0;
  const editionGain: Record<string, number> = {};
  for (const type of Object.keys(OPERATOR_BUILDINGS) as BaseOperatorType[]) {
    if (!state.unlockedBuildings.includes(type)) continue;
    const op = operationOf(type).id;
    const v = speed(trackOf(type)) * operatorSpeedFactor(type, tuning);
    ordinary[op] = Math.max(ordinary[op] ?? 0, v);
    for (const e of SPECIAL_EDITIONS) {
      const gain = (EDITION_EFFECTS[type]?.[e]?.speed ?? 1) - 1;
      editionGain[e] = Math.max(editionGain[e] ?? 0, gain);
    }
  }
  // An edition card speeds up one ordinary operator: one more building's worth × its gain.
  for (const e of SPECIAL_EDITIONS) {
    const free = Math.max(0, state.editionCards[e] - state.editionsLost[e]);
    editionBonus += free * (editionGain[e] ?? 0);
  }
  const limited: Partial<Record<OperationId, number>> = {};
  for (const [key, count] of Object.entries(state.specials)) {
    const [type, edition] = key.split(':') as [string, Edition];
    if (!isSpecial(type) || count <= 0) continue;
    const op = operationOf(type).id;
    const v =
      speed(trackOf(type)) *
      specialSpeedFactor(type, tuning) *
      (EDITION_EFFECTS[type]?.[edition as Exclude<Edition, 'base'>]?.speed ?? 1);
    limited[op] = (limited[op] ?? 0) + count * v;
  }
  const extractorRate = extractorCapacity(up.extractor) * beltSpeed(up.belt);
  return { ordinary, limited, editionBonus, extractorRate };
}

/**
 * Prices of the operations, normalised by the generic capacity `G` (COST comment):
 * - an ordinary operation costs `1 / v` (its best ordinary speed `v`), lowered when limited
 *   copies perform it too: they add their throughput to the ordinary buildings;
 * - an operation only limited buildings perform costs `G / lim` on their own line, which
 *   works in parallel with the ordinary factory (mixing, `cost.ts`).
 */
export function pricedOperations(
  ordinary: Throughput['ordinary'],
  limited: Throughput['limited'],
  G: number,
): PricedOperation[] {
  const ops: PricedOperation[] = [];
  for (const op of OPERATION_IDS) {
    const v = ordinary[op];
    const lim = limited[op] ?? 0;
    if (v !== undefined && v > 0) ops.push({ op, price: (1 / v) * (G / (G + lim / v)) });
    else if (lim > 0) ops.push({ op, price: G / lim, limited: true });
  }
  return ops;
}

/**
 * Cost tools of a level, normalised by the generic capacity `G`: the time of one item is
 * `itemCost(tools) / G` (COST comment). Normalising keeps the cache shared across levels
 * whose speeds are the same.
 */
export function costTools(
  state: GameState,
  level: number,
  tuning: TuningValues = TUNED,
): { tools: CostTools; capacity: number } {
  const t = throughputOf(state, level, tuning);
  const G = factoryCapacity(level) + t.editionBonus;
  const tools: CostTools = {
    values: extractableValues(state.maxExtraction),
    rawBase: COST.raw.weight / t.extractorRate,
    rawPenalty: COST.raw.valuePenalty,
    ops: pricedOperations(t.ordinary, t.limited, G),
  };
  return { tools, capacity: G };
}
