import {
  type Feature,
  HUB,
  LEVELS,
  type PlaceableType,
  START_BUILDINGS,
  START_MAX_EXTRACTION,
  type Track,
} from '../config/balance';
import type { Edition, PassiveId, SpecialEdition } from '../config/cards';
import { toSeed } from '../core/rng';
import type { Clip, Marker } from './clip';
import type { Belt, Bridge, Building } from './entities';
import { ensureLevels, type GeneratedLevel } from './levels';
import type { OfferCard } from './offers';

export interface Requirement {
  value: number;
  required: number;
  delivered: number;
}

/** A card obtained (PLAN-recompenses §5.1). `level` 0 = granted outside an offer (debug). */
export interface CardPick {
  level: number;
  card: string;
  edition: Edition;
  /** Value obtained by a value card. */
  value?: number;
  tick: number;
}

/** The offer drawn for `pendingLevels[0]`, stored so a reload shows the same cards. */
export interface StoredOffer {
  level: number;
  cards: OfferCard[];
}

export interface GameState {
  /** 32-bit game seed: the whole map and every random target derive from it (PLAN §4.4). */
  seed: number;
  tick: number;
  level: number;
  /** Generated levels, index 0 = level 1, up to current + lookahead (PLAN §7.2). */
  levels: GeneratedLevel[];
  /** Requirement of the current level; null once the final level is done (free play). */
  levelRequirement: Requirement | null;
  /** Tick at which the final level was completed, or null. */
  finishedAtTick: number | null;
  /** Highest extractable value (10 is never extractable). PLAN §4.5. */
  maxExtraction: number;
  unlockedBuildings: PlaceableType[];
  unlockedFeatures: Feature[];
  /** Upgrade level per track (1 = initial). */
  upgrades: Record<Track, number>;
  /** Generated number sequences t1, t2, … per track (PLAN §7.3). */
  upgradeSeqs: Record<Track, number[]>;
  /** Active requirements of each track's next upgrade (empty if locked or maxed). */
  upgradeReqs: Record<Track, Requirement[]>;
  /** Buy upgrades automatically when ready (option, off by default). */
  autoBuyUpgrades: boolean;
  /** Belts by tile key. */
  belts: Map<number, Belt>;
  /** Bridges by tile key (a tile holds a belt or a bridge, never both). */
  bridges: Map<number, Bridge>;
  /** Buildings by id. The hub is id 0. */
  buildings: Map<number, Building>;
  nextBuildingId: number;
  /** Total items delivered to the hub, all values. */
  totalDelivered: number;
  /** Text markers by tile key (PLAN §8.2). */
  markers: Map<number, Marker>;
  /** Help bubbles already shown and dismissed (PLAN §7.5). */
  helpSeen: string[];
  /** Clipboard history, most recent first, at most `EDIT.clipboardSize` entries (PLAN §8.2). */
  clipboard: Clip[];
  /** Cards obtained, in order (fixed levels, offers, debug grants). */
  picks: CardPick[];
  /** Completed levels whose offer is not chosen yet, in order. */
  pendingLevels: number[];
  /** Offer drawn for `pendingLevels[0]`, or null until it is drawn (lazily). */
  currentOffer: StoredOffer | null;
  /** Edition cards obtained. Free ones are computed (obtained minus applied, `sim/inventory`). */
  editionCards: Record<SpecialEdition, number>;
  /**
   * Edition cards lost for good: permanent editions (`EDITION_RULES` false) demolished or
   * swapped away. Always 0 with the default rules. Undo / redo adjust it (`Change.lost`).
   */
  editionsLost: Record<SpecialEdition, number>;
  /** Special buildings obtained, by `"type:edition"`. Free ones are computed. */
  specials: Record<string, number>;
  passives: PassiveId[];
  /** Refusals of the current natural item (reset to 0 when it is obtained). */
  naturalRefusals: number;
}

export const HUB_ID = 0;

/** Requirement for `level`, generating levels ahead as needed. */
export function requirementFor(state: GameState, level: number): Requirement | null {
  ensureLevels(state.seed, state.levels, level + LEVELS.lookahead);
  const def = state.levels[level - 1];
  return def ? { value: def.target, required: def.quantity, delivered: 0 } : null;
}

/** Fresh game state with the hub in place. */
export function createInitialState(seed: number): GameState {
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
  const state: GameState = {
    seed: toSeed(seed),
    tick: 0,
    level: 1,
    levels: [],
    levelRequirement: null,
    finishedAtTick: null,
    maxExtraction: START_MAX_EXTRACTION,
    unlockedBuildings: [...START_BUILDINGS],
    unlockedFeatures: [],
    upgrades: { belt: 1, extractor: 1, adder: 1, multiplier: 1, subdiv: 1, exponent: 1 },
    upgradeSeqs: { belt: [], extractor: [], adder: [], multiplier: [], subdiv: [], exponent: [] },
    upgradeReqs: { belt: [], extractor: [], adder: [], multiplier: [], subdiv: [], exponent: [] },
    autoBuyUpgrades: false,
    belts: new Map(),
    bridges: new Map(),
    buildings,
    nextBuildingId: HUB_ID + 1,
    totalDelivered: 0,
    markers: new Map(),
    helpSeen: [],
    clipboard: [],
    picks: [],
    pendingLevels: [],
    currentOffer: null,
    editionCards: { brillante: 0, legendaire: 0 },
    editionsLost: { brillante: 0, legendaire: 0 },
    specials: {},
    passives: [],
    naturalRefusals: 0,
  };
  state.levelRequirement = requirementFor(state, 1);
  return state;
}

export function isBuildingUnlocked(state: GameState, type: PlaceableType): boolean {
  return state.unlockedBuildings.includes(type);
}

export function isFeatureUnlocked(state: GameState, feature: Feature): boolean {
  return state.unlockedFeatures.includes(feature);
}
