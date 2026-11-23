/**
 * Reward card catalogue (PLAN-recompenses §3, §5.1). Every card and every offer setting lives
 * here; the draw itself is in `sim/offers.ts`. No card-specific rule is written elsewhere.
 */
import type { MessageKey } from '../i18n';
import type { Feature, PlaceableType } from './balance';
import type { BuildingType, SpecialType } from './buildings';

export type { SpecialType } from './buildings';

/** Card slot of the catalogue. */
export type Slot = 'nombres' | 'atelier';
/** Slot of an offer: the catalogue slots plus Joker (any card), added by Éventail. */
export type OfferSlot = Slot | 'joker';
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
  /** Slot it is drawn in; null = never drawn (fixed levels 1 and 2, debug grants). */
  slot: Slot | null;
  effect: CardEffect;
  requires?: readonly Prereq[];
  /** First offer level where the card can appear. */
  minLevel?: number;
  /** 1 = unique card; absent = unlimited. */
  maxPicks?: number;
  /** Relative weight curve, interpolated by level (empty only for never-drawn cards). */
  weight: readonly CurvePoint[];
  /** Help bubble id shown the first time (ui/help.ts). */
  tip?: string;
  /** Icon id read by the offer screen: `kind:name`. */
  icon: string;
  title: MessageKey;
  text: MessageKey;
  /** Placeholder object, removed or replaced in phase 2. */
  placeholder?: boolean;
}

/** Offer settings (PLAN-recompenses §3.1, §3.3). */
export const OFFERS = {
  /** Levels 1..fixedUntil give their natural reward directly, without an offer. */
  fixedUntil: 2,
  /** Slots of every offer, drawn in this order. */
  slots: ['nombres', 'atelier'] as const satisfies readonly Slot[],
  /** Weight floor of the natural card ("fil rouge"), by level. */
  natural: [
    { level: 3, w: 50 },
    { level: 20, w: 25 },
    { level: 40, w: 15 },
  ] as const satisfies readonly CurvePoint[],
  /** Natural weight × decay^refusals, never below the card's own curve. */
  naturalRefusalDecay: 0.7,
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
  ancientAdder: operatorEdition,
};

/** Effect of each passive card. */
export const PASSIVE_EFFECTS: Readonly<Record<PassiveId, { operatorSpeed: number }>> = {
  operatorsBoost: { operatorSpeed: 1.05 },
};

/** Effect of each meta card on the following offers. */
export const META_EFFECTS: Readonly<Record<MetaId, { extraSlots: readonly OfferSlot[] }>> = {
  eventail: { extraSlots: ['joker'] },
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

/** Weight guards (§3.3). Real rules come in phase 3. */
export const GUARDS: readonly Guard[] = [
  {
    id: 'no-growth-operator',
    when: (ctx) => ctx.level >= 12 && !ctx.unlockedBuildings.includes('multiplier'),
    cards: ['mult'],
    factor: 3,
    placeholder: true,
  },
];

/** Weight curve of an unlock placed at level L in LEVEL_TABLE: rare before, common around. */
function unlockCurve(L: number): readonly CurvePoint[] {
  return [
    { level: L - 4, w: 2 },
    { level: L, w: 20 },
    { level: L + 6, w: 8 },
  ];
}

const flat = (w: number): readonly CurvePoint[] => [{ level: 1, w }];

/** The catalogue (§3.2). Order matters only for ties in the debug weight table. */
export const CARDS: readonly CardDef[] = [
  {
    id: 'value',
    slot: 'nombres',
    effect: { kind: 'value' },
    weight: flat(20),
    tip: 'value',
    icon: 'value',
    title: 'card.value.title',
    text: 'card.value.text',
  },
  {
    id: 'adder',
    slot: null,
    effect: { kind: 'unlock', building: 'adder' },
    weight: [],
    tip: 'adder',
    icon: 'building:adder',
    title: 'card.adder.title',
    text: 'card.adder.text',
  },
  {
    id: 'upgrades',
    slot: null,
    effect: { kind: 'feature', feature: 'upgrades' },
    weight: [],
    tip: 'upgrades',
    icon: 'feature:upgrades',
    title: 'card.upgrades.title',
    text: 'card.upgrades.text',
  },
  {
    id: 'mult',
    slot: 'nombres',
    effect: { kind: 'unlock', building: 'multiplier' },
    requires: [{ building: 'adder' }],
    weight: unlockCurve(7),
    tip: 'multiplier',
    icon: 'building:multiplier',
    title: 'card.mult.title',
    text: 'card.mult.text',
  },
  {
    id: 'sub',
    slot: 'nombres',
    effect: { kind: 'unlock', building: 'subtractor' },
    requires: [{ building: 'multiplier' }],
    weight: unlockCurve(13),
    tip: 'subtractor',
    icon: 'building:subtractor',
    title: 'card.sub.title',
    text: 'card.sub.text',
  },
  {
    id: 'div',
    slot: 'nombres',
    effect: { kind: 'unlock', building: 'divider' },
    requires: [{ building: 'subtractor' }],
    weight: unlockCurve(16),
    tip: 'divider',
    icon: 'building:divider',
    title: 'card.div.title',
    text: 'card.div.text',
  },
  {
    id: 'exp',
    slot: 'nombres',
    effect: { kind: 'unlock', building: 'exponent' },
    requires: [{ building: 'multiplier' }],
    weight: unlockCurve(19),
    tip: 'exponent',
    icon: 'building:exponent',
    title: 'card.exp.title',
    text: 'card.exp.text',
  },
  {
    id: 'bridge',
    slot: 'atelier',
    effect: { kind: 'unlock', building: 'bridge' },
    weight: unlockCurve(4),
    tip: 'bridge',
    icon: 'building:bridge',
    title: 'card.bridge.title',
    text: 'card.bridge.text',
  },
  {
    id: 'priorities',
    slot: 'atelier',
    effect: { kind: 'feature', feature: 'priorities' },
    requires: [{ building: 'bridge' }],
    weight: unlockCurve(10),
    tip: 'priorities',
    icon: 'feature:priorities',
    title: 'card.priorities.title',
    text: 'card.priorities.text',
  },
  {
    id: 'storage',
    slot: 'atelier',
    effect: { kind: 'unlock', building: 'storage' },
    requires: [{ level: 12 }],
    weight: unlockCurve(22),
    tip: 'storage',
    icon: 'building:storage',
    title: 'card.storage.title',
    text: 'card.storage.text',
  },
  {
    id: 'edition-brillante',
    slot: 'atelier',
    effect: { kind: 'edition', edition: 'brillante' },
    weight: flat(6),
    tip: 'edition.brillante',
    icon: 'edition:brillante',
    title: 'card.editionBrillante.title',
    text: 'card.editionBrillante.text',
  },
  {
    id: 'edition-legendaire',
    slot: 'atelier',
    effect: { kind: 'edition', edition: 'legendaire' },
    weight: flat(2),
    tip: 'edition.legendaire',
    icon: 'edition:legendaire',
    title: 'card.editionLegendaire.title',
    text: 'card.editionLegendaire.text',
  },
  {
    id: 'ancient-adder',
    slot: 'atelier',
    effect: { kind: 'special', building: 'ancientAdder', count: 1 },
    weight: flat(4),
    tip: 'special',
    icon: 'special:ancientAdder',
    title: 'card.ancientAdder.title',
    text: 'card.ancientAdder.text',
    placeholder: true,
  },
  {
    id: 'passive-operators',
    slot: 'atelier',
    effect: { kind: 'passive', id: 'operatorsBoost' },
    weight: flat(3),
    tip: 'passive',
    icon: 'passive:operatorsBoost',
    title: 'card.passiveOperators.title',
    text: 'card.passiveOperators.text',
    placeholder: true,
  },
  {
    id: 'eventail',
    slot: 'atelier',
    effect: { kind: 'meta', id: 'eventail' },
    minLevel: 6,
    maxPicks: 1,
    weight: flat(3),
    tip: 'eventail',
    icon: 'meta:eventail',
    title: 'card.eventail.title',
    text: 'card.eventail.text',
  },
];
