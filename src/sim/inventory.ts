/**
 * Edition cards and special buildings (PLAN-recompenses §3.5): the state records what the
 * player obtained, what is free is computed from the map. Demolishing, moving, undoing and
 * redoing therefore need no inventory code: a demolished building is simply no longer
 * counted. The only stored adjustment is `editionsLost`, for permanent editions.
 */
import {
  EDITION_EFFECTS,
  type Edition,
  type EditionEffect,
  SPECIAL_EDITIONS,
  type SpecialEdition,
} from '../config/cards';
import type { BuildingType } from '../config/buildings';
import type { Building } from './entities';
import type { GameState } from './state';
import type { World } from './world';

/** Edition of a building that never leaves it (special buildings), base otherwise. */
export function nativeEdition(b: Pick<Building, 'edition' | 'editionApplied'>): Edition {
  return b.edition !== undefined && b.editionApplied !== true ? b.edition : 'base';
}

/** The edition applied from a card, or null. */
export function appliedEdition(
  b: Pick<Building, 'edition' | 'editionApplied'>,
): SpecialEdition | null {
  return b.edition !== undefined && b.editionApplied === true ? b.edition : null;
}

/** Edition cards applied on placed buildings, by edition. */
export function appliedEditions(state: GameState): Record<SpecialEdition, number> {
  const out: Record<SpecialEdition, number> = { brillante: 0, legendaire: 0 };
  for (const b of state.buildings.values()) {
    const e = appliedEdition(b);
    if (e) out[e] += 1;
  }
  return out;
}

/** Free edition cards of `edition`: obtained − lost − applied on placed buildings. */
export function freeEditionCards(state: GameState, edition: SpecialEdition): number {
  return freeEditions(state)[edition];
}

/** Free edition cards of every edition (one pass over the buildings). */
export function freeEditions(state: GameState): Record<SpecialEdition, number> {
  const applied = appliedEditions(state);
  const out: Record<SpecialEdition, number> = { brillante: 0, legendaire: 0 };
  for (const e of SPECIAL_EDITIONS) {
    out[e] = Math.max(0, state.editionCards[e] - state.editionsLost[e] - applied[e]);
  }
  return out;
}

/** The player has obtained at least one edition card (the Edition tool is shown). */
export function hasEditionCards(state: GameState): boolean {
  return SPECIAL_EDITIONS.some((e) => state.editionCards[e] > 0);
}

/** Key of `specials`: type and native edition. */
export function specialKey(type: string, edition: Edition): string {
  return `${type}:${edition}`;
}

/** Special buildings of `key` (`"type:edition"`) placed on the map. */
export function placedSpecials(state: GameState, key: string): number {
  let n = 0;
  for (const b of state.buildings.values()) if (specialKey(b.type, nativeEdition(b)) === key) n++;
  return n;
}

/** Free special buildings of `key`: obtained − placed (data model only until R6). */
export function freeSpecials(state: GameState, key: string): number {
  return Math.max(0, (state.specials[key] ?? 0) - placedSpecials(state, key));
}

/** Building types an edition card can go on: those with edition effects (the hub has none). */
export function editionCapable(type: BuildingType): boolean {
  return type !== 'hub' && EDITION_EFFECTS[type] !== undefined;
}

/** Multipliers of a building's edition (empty for base). */
export function editionEffect(b: {
  type: BuildingType;
  edition?: SpecialEdition | undefined;
}): EditionEffect {
  if (b.edition === undefined) return {};
  return EDITION_EFFECTS[b.type]?.[b.edition] ?? {};
}

/**
 * What applying `edition` on `b` would do: `apply` (base building), `swap` (another applied
 * edition, whose card comes back), or why it is refused: `same` edition already, `native`
 * edition of a special building, `unsupported` building (hub), or `noCard` free.
 */
export type EditionCheck = 'apply' | 'swap' | 'same' | 'native' | 'unsupported' | 'noCard';

export function editionCheck(state: GameState, b: Building, edition: SpecialEdition): EditionCheck {
  if (!editionCapable(b.type)) return 'unsupported';
  if (nativeEdition(b) !== 'base') return 'native';
  const current = appliedEdition(b);
  if (current === edition) return 'same';
  if (freeEditionCards(state, edition) <= 0) return 'noCard';
  return current ? 'swap' : 'apply';
}

/**
 * Apply an edition card on `b` (inside a history action, so it can be undone). Swapping
 * gives the old card back, unless editions are permanent (`removable` false): then it is
 * lost. Returns false when refused (see `editionCheck`).
 */
export function applyEdition(world: World, b: Building, edition: SpecialEdition): boolean {
  const check = editionCheck(world.state, b, edition);
  if (check !== 'apply' && check !== 'swap') return false;
  const old = appliedEdition(b);
  if (old && !world.editionRules.removable) world.state.editionsLost[old] += 1;
  world.setBuildingEdition(b, edition, true);
  return true;
}

/** "Remove the edition" is offered: an applied edition, and the rules allow it. */
export function canRemoveEdition(world: World, b: Building): boolean {
  return world.editionRules.removable && appliedEdition(b) !== null;
}

/** Put `b` back to base and give its edition card back. False when not allowed. */
export function removeEdition(world: World, b: Building): boolean {
  if (!canRemoveEdition(world, b)) return false;
  world.setBuildingEdition(b, null, false);
  return true;
}
