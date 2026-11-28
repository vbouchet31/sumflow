/**
 * Reward card catalogue (PLAN-recompenses §3, §5.1). Every card and every offer setting lives
 * here; the draw itself is in `sim/offers.ts`. No card-specific rule is written elsewhere.
 */
import type { MessageKey } from '../i18n';
import type { Feature, PlaceableType } from './balance';
import type { BuildingType, SpecialType } from './buildings';

export type { SpecialType } from './buildings';

export type Edition = 'base' | 'brillante' | 'legendaire';
export type SpecialEdition = Exclude<Edition, 'base'>;
export const EDITIONS: readonly Edition[] = ['base', 'brillante', 'legendaire'];
/** Editions of an edition card (every edition but base). */
export const SPECIAL_EDITIONS: readonly SpecialEdition[] = ['brillante', 'legendaire'];

/** One point of a weight curve: weight `w` at level `level`. */
export interface CurvePoint {
  level: number;
  w: number;
}

export type PassiveId = 'operatorsBoost';
export type MetaId = 'eventail';

export type Prereq =
  | { building: PlaceableType }
  | { feature: Feature }
  /** Extraction cap reached (`maxExtraction ≥ value`). */
  | { value: number }
  /** Card picked at least once. */
  | { card: string }
  /** Offer level reached. */
  | { level: number };

export type CardEffect =
  /** Next extractable value: `maxExtraction` + 1, skipping the forbidden value. */
  | { kind: 'value' }
  | { kind: 'unlock'; building: PlaceableType }
  | { kind: 'feature'; feature: Feature }
  | { kind: 'special'; building: SpecialType; count: number }
  | { kind: 'edition'; edition: SpecialEdition }
  | { kind: 'passive'; id: PassiveId }
  | { kind: 'meta'; id: MetaId };

export interface CardDef {
  id: string;
  /**
   * Drawn in the palier offers (PLAN-paliers §3.4). False for the socle, the fil rouge cards
   * every level gives at once: they are never drawn.
   */
  drawable: boolean;
  effect: CardEffect;
  requires?: readonly Prereq[];
  /** First offer level where the card can appear. */
  minLevel?: number;
  /** 1 = unique card; absent = unlimited. */
  maxPicks?: number;
  /** Relative weight curve, interpolated by level (empty only for never-drawn cards). */
  weight: readonly CurvePoint[];
  /**
   * Safety net (PLAN-paliers §3.5): after this many palier offers where the card was
   * available but not offered, it is forced into the next one. Absent = never forced.
   */
  pity?: number;
  /** Help bubble id shown the first time (ui/help.ts). */
  tip?: string;
  /** Icon id read by the offer screen: `kind:name`. */
  icon: string;
  title: MessageKey;
  text: MessageKey;
  /** Placeholder object, removed or replaced in phase 2. */
  placeholder?: boolean;
}

/** Palier offer settings (PLAN-paliers §3.4). */
export const OFFERS = {
  /** Cards of an offer without Éventail. */
  baseCards: 2,
  /** Most cards of an offer, Éventail included. */
  maxCards: 4,
  /** Cards of one genre (`effect.kind`) in an offer, while other genres are available. */
  maxPerGenre: 1,
} as const;

/** Native edition odds of a special building (relative weights). */
export const SPECIAL_EDITION_ODDS: Readonly<Record<Edition, number>> = {
  base: 85,
  brillante: 10,
  legendaire: 5,
};

/** How applied editions behave (PLAN-recompenses §3.5). */
export interface EditionRules {
  /** Demolishing a building gives its applied edition card back (else the card is lost). */
  returnOnDemolish: boolean;
  /**
   * "Remove the edition" is offered, and swapping editions gives the old card back (else
   * the old card is lost: editions are permanent, as in Balatro).
   */
  removable: boolean;
}

/** Applied editions: given back on demolish, removable without demolishing (§3.5). */
export const EDITION_RULES: Readonly<EditionRules> = { returnOnDemolish: true, removable: true };

/** Multipliers of an edition. Absent = unchanged. */
export interface EditionEffect {
  /** Operations per second (the cycle gets shorter). */
  speed?: number;
  /** Extractor output. */
  rate?: number;
  /** Storage capacity. */
  capacity?: number;
}

const operatorEdition = { brillante: { speed: 1.25 }, legendaire: { speed: 1.5 } } as const;

/** Provisional edition effects by building type (§3.4). Absent = visual only, to be defined. */
export const EDITION_EFFECTS: Partial<
  Record<BuildingType, Readonly<Record<SpecialEdition, EditionEffect>>>
> = {
  adder: operatorEdition,
  multiplier: operatorEdition,
  subtractor: operatorEdition,
  divider: operatorEdition,
  exponent: operatorEdition,
  extractor: { brillante: { rate: 1.25 }, legendaire: { rate: 1.5 } },
  storage: { brillante: { capacity: 1.25 }, legendaire: { capacity: 1.5 } },
  concat: operatorEdition,
};

/** Effect of each passive card. */
export const PASSIVE_EFFECTS: Readonly<Record<PassiveId, { operatorSpeed: number }>> = {
  operatorsBoost: { operatorSpeed: 1.05 },
};

/** Effect of each meta card on the following offers: cards added per copy picked. */
export const META_EFFECTS: Readonly<Record<MetaId, { extraCards: number }>> = {
  eventail: { extraCards: 1 },
};

/** What a guard can read (a subset of the offer context, see `sim/offers.ts`). */
export interface GuardView {
  level: number;
  maxExtraction: number;
  unlockedBuildings: readonly PlaceableType[];
  unlockedFeatures: readonly Feature[];
}

/** A readable weight rule: when `when` holds, the weight of `cards` is multiplied by `factor`. */
export interface Guard {
  id: string;
  when: (ctx: GuardView) => boolean;
  cards: readonly string[];
  factor: number;
  placeholder?: boolean;
}

/** Weight guards (§3.3). None for now: the mechanism waits for real rules. */
export const GUARDS: readonly Guard[] = [];

const flat = (w: number): readonly CurvePoint[] => [{ level: 1, w }];

/** The catalogue (§3.2). Order matters only for ties in the debug weight table. */
export const CARDS: readonly CardDef[] = [
  {
    id: 'value',
    drawable: false,
    effect: { kind: 'value' },
    weight: [],
    tip: 'value',
    icon: 'value',
    title: 'card.value.title',
    text: 'card.value.text',
  },
  {
    id: 'adder',
    drawable: false,
    effect: { kind: 'unlock', building: 'adder' },
    weight: [],
    tip: 'adder',
    icon: 'building:adder',
    title: 'card.adder.title',
    text: 'card.adder.text',
  },
  {
    id: 'upgrades',
    drawable: false,
    effect: { kind: 'feature', feature: 'upgrades' },
    weight: [],
    tip: 'upgrades',
    icon: 'feature:upgrades',
    title: 'card.upgrades.title',
    text: 'card.upgrades.text',
  },
  {
    id: 'mult',
    drawable: false,
    effect: { kind: 'unlock', building: 'multiplier' },
    requires: [{ building: 'adder' }],
    weight: [],
    tip: 'multiplier',
    icon: 'building:multiplier',
    title: 'card.mult.title',
    text: 'card.mult.text',
  },
  {
    id: 'sub',
    drawable: false,
    effect: { kind: 'unlock', building: 'subtractor' },
    requires: [{ building: 'multiplier' }],
    weight: [],
    tip: 'subtractor',
    icon: 'building:subtractor',
    title: 'card.sub.title',
    text: 'card.sub.text',
  },
  {
    id: 'div',
    drawable: false,
    effect: { kind: 'unlock', building: 'divider' },
    requires: [{ building: 'subtractor' }],
    weight: [],
    tip: 'divider',
    icon: 'building:divider',
    title: 'card.div.title',
    text: 'card.div.text',
  },
  {
    id: 'exp',
    drawable: false,
    effect: { kind: 'unlock', building: 'exponent' },
    requires: [{ building: 'multiplier' }],
    weight: [],
    tip: 'exponent',
    icon: 'building:exponent',
    title: 'card.exp.title',
    text: 'card.exp.text',
  },
  {
    id: 'bridge',
    drawable: false,
    effect: { kind: 'unlock', building: 'bridge' },
    weight: [],
    tip: 'bridge',
    icon: 'building:bridge',
    title: 'card.bridge.title',
    text: 'card.bridge.text',
  },
  {
    id: 'priorities',
    drawable: false,
    effect: { kind: 'feature', feature: 'priorities' },
    requires: [{ building: 'bridge' }],
    weight: [],
    tip: 'priorities',
    icon: 'feature:priorities',
    title: 'card.priorities.title',
    text: 'card.priorities.text',
  },
  {
    id: 'storage',
    drawable: false,
    effect: { kind: 'unlock', building: 'storage' },
    requires: [{ level: 12 }],
    weight: [],
    tip: 'storage',
    icon: 'building:storage',
    title: 'card.storage.title',
    text: 'card.storage.text',
  },
  {
    id: 'edition-brillante',
    drawable: true,
    effect: { kind: 'edition', edition: 'brillante' },
    weight: flat(6),
    tip: 'edition.brillante',
    icon: 'edition:brillante',
    title: 'card.editionBrillante.title',
    text: 'card.editionBrillante.text',
  },
  {
    id: 'edition-legendaire',
    drawable: true,
    effect: { kind: 'edition', edition: 'legendaire' },
    weight: flat(2),
    tip: 'edition.legendaire',
    icon: 'edition:legendaire',
    title: 'card.editionLegendaire.title',
    text: 'card.editionLegendaire.text',
  },
  {
    // Concaténateur (docs/objets/concat.md).
    id: 'concat',
    drawable: true,
    effect: { kind: 'special', building: 'concat', count: 1 },
    requires: [{ building: 'multiplier' }],
    minLevel: 8,
    weight: [
      { level: 8, w: 2 },
      { level: 12, w: 5 },
      { level: 20, w: 5 },
      { level: 30, w: 3 },
    ],
    tip: 'concat',
    icon: 'special:concat',
    title: 'card.concat.title',
    text: 'card.concat.text',
  },
  {
    id: 'passive-operators',
    drawable: true,
    effect: { kind: 'passive', id: 'operatorsBoost' },
    weight: flat(3),
    tip: 'passive',
    icon: 'passive:operatorsBoost',
    title: 'card.passiveOperators.title',
    text: 'card.passiveOperators.text',
    placeholder: true,
  },
  {
    // Éventail I and II (PLAN-paliers §3.5): 3 then 4 cards per offer.
    id: 'eventail',
    drawable: true,
    effect: { kind: 'meta', id: 'eventail' },
    minLevel: 6,
    maxPicks: 1,
    weight: flat(8),
    pity: 4,
    tip: 'eventail',
    icon: 'meta:eventail',
    title: 'card.eventail.title',
    text: 'card.eventail.text',
  },
  {
    id: 'eventail-2',
    drawable: true,
    effect: { kind: 'meta', id: 'eventail' },
    requires: [{ card: 'eventail' }],
    minLevel: 12,
    maxPicks: 1,
    weight: flat(6),
    pity: 4,
    tip: 'eventail',
    icon: 'meta:eventail',
    title: 'card.eventail2.title',
    text: 'card.eventail2.text',
  },
];
