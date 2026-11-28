/**
 * Reward offers (PLAN-recompenses §3.1 to §3.3, §3.6): availability, weights, natural card
 * ("fil rouge") and the seeded draw. Pure functions, decoupled from `GameState` through
 * `OfferContext`, so the draw simulator (phase 2) can run them alone.
 */
import {
  LEVEL_TABLE,
  MAPGEN,
  type Reward,
  START_BUILDINGS,
  START_MAX_EXTRACTION,
} from '../config/balance';
import {
  CARDS,
  type CardDef,
  type CurvePoint,
  type Edition,
  EDITIONS,
  GUARDS,
  type Guard,
  type GuardView,
  META_EFFECTS,
  OFFERS,
  type OfferSlot,
  type Prereq,
  SPECIAL_EDITION_ODDS,
} from '../config/cards';
import { TUNED, type TuningValues, weightScale } from '../config/tuning';
import { hash2, mulberry32, type Rng } from '../core/rng';

/** Everything a draw reads from the game. */
export interface OfferContext extends GuardView {
  seed: number;
  /** Level whose offer is drawn (the level of the palier). */
  level: number;
  /** Palier of the offer, 1-based (PLAN-paliers §3.2); 0 outside a palier (debug table). */
  palier: number;
  /** Times each card id was picked. */
  picks: Readonly<Record<string, number>>;
}

/** Cards, guards and tuned values a draw uses (tests and the simulator can pass their own). */
export interface Catalogue {
  cards: readonly CardDef[];
  guards: readonly Guard[];
  /** Weight scale of each card (`config/tuning.ts`); absent = the tuned values. */
  tuning?: TuningValues;
}

export const DEFAULT_CATALOGUE: Catalogue = { cards: CARDS, guards: GUARDS, tuning: TUNED };

/** One element of the natural sequence; `value` is set for value cards. */
export interface NaturalStep {
  card: string;
  value?: number;
}

/** A card of an offer. `value` is the value a value card gives. */
export interface OfferCard {
  card: string;
  edition: Edition;
  value?: number;
}

/** Weight breakdown of one available card (debug panel). */
export interface WeightEntry {
  card: string;
  /** Weight from the card's own curve, times its tuned scale (PLAN-objets §5). */
  curve: number;
  /** Boosted weight if it is the natural card, else null. */
  natural: number | null;
  /** Product of the guard factors that apply. */
  guard: number;
  /** Final weight used by the draw. */
  weight: number;
}

/** How one slot of an offer was drawn. */
export interface SlotDraw {
  slot: OfferSlot;
  /** Pool actually drawn from: the slot itself, the other slot (fallback) or null (empty). */
  pool: OfferSlot | null;
  weights: WeightEntry[];
  card: OfferCard | null;
}

export interface Offer {
  level: number;
  cards: OfferCard[];
  slots: SlotDraw[];
}

/** Salt separating the offer stream from the level and upgrade streams. */
const OFFER_SALT = 0x4f464652; // "OFFR"

/** Linear interpolation of a weight curve, clamped to its first and last points. 0 if empty. */
export function curveAt(points: readonly CurvePoint[], level: number): number {
  const first = points[0];
  if (!first) return 0;
  if (level <= first.level) return first.w;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    if (level <= b.level) {
      if (b.level === a.level) return b.w;
      return a.w + ((b.w - a.w) * (level - a.level)) / (b.level - a.level);
    }
  }
  return points[points.length - 1]?.w ?? 0;
}

/** Next extractable value after `maxExtraction`, skipping the forbidden value (9 → 11). */
export function nextValue(maxExtraction: number): number {
  let v = maxExtraction + 1;
  if (v === MAPGEN.forbiddenValue) v += 1;
  return v;
}

/** The card whose effect gives `reward` (the LEVEL_TABLE kind), or undefined. */
export function cardForReward(
  reward: Reward,
  cards: readonly CardDef[] = CARDS,
): CardDef | undefined {
  return cards.find((c) => {
    const e = c.effect;
    if (reward.kind === 'extraction') return e.kind === 'value';
    if (reward.kind === 'building') return e.kind === 'unlock' && e.building === reward.building;
    return e.kind === 'feature' && e.feature === reward.feature;
  });
}

const sequences = new WeakMap<readonly CardDef[], readonly NaturalStep[]>();

/**
 * The natural sequence: LEVEL_TABLE rewards in order, as cards (§3.1). The k-th value step
 * gives the k-th extractable value (2, 3, … 9, 11, …). Infinite levels continue with "value".
 */
export function naturalSequence(cat: Catalogue = DEFAULT_CATALOGUE): readonly NaturalStep[] {
  const cached = sequences.get(cat.cards);
  if (cached) return cached;
  const steps: NaturalStep[] = [];
  let max = START_MAX_EXTRACTION;
  for (const def of LEVEL_TABLE) {
    const card = cardForReward(def.reward, cat.cards);
    if (!card) throw new Error(`No card for level reward ${JSON.stringify(def.reward)}`);
    if (card.effect.kind === 'value') {
      max = nextValue(max);
      steps.push({ card: card.id, value: max });
    } else {
      steps.push({ card: card.id });
    }
  }
  sequences.set(cat.cards, steps);
  return steps;
}

/**
 * The natural step of `level`: its LEVEL_TABLE reward as a card, then "value" for every
 * infinite level, the k-th value step giving the k-th extractable value.
 */
export function naturalStep(level: number, cat: Catalogue = DEFAULT_CATALOGUE): NaturalStep {
  const seq = naturalSequence(cat);
  const step = seq[level - 1];
  if (step) return step;
  const value = cat.cards.find((c) => c.effect.kind === 'value');
  if (!value) throw new Error('The catalogue has no value card');
  let max = START_MAX_EXTRACTION;
  for (const s of seq) if (s.value !== undefined) max = s.value;
  for (let n = seq.length; n < level; n++) max = nextValue(max);
  return { card: value.id, value: max };
}

/** Has the player already obtained this natural step? */
export function isNaturalOwned(
  step: NaturalStep,
  ctx: OfferContext,
  cat: Catalogue = DEFAULT_CATALOGUE,
): boolean {
  return isStepOwned(
    step,
    cat.cards.find((c) => c.id === step.card),
    ctx,
  );
}

function isStepOwned(step: NaturalStep, card: CardDef | undefined, ctx: OfferContext): boolean {
  if (step.value !== undefined) return ctx.maxExtraction >= step.value;
  if (!card) return false;
  return isObtained(card, ctx);
}

/** Unlock and feature cards are obtained once their building or feature is unlocked. */
function isObtained(card: CardDef, ctx: OfferContext): boolean {
  const e = card.effect;
  if (e.kind === 'unlock') return ctx.unlockedBuildings.includes(e.building);
  if (e.kind === 'feature') return ctx.unlockedFeatures.includes(e.feature);
  return (ctx.picks[card.id] ?? 0) > 0;
}

/** The natural card of an offer: the first natural step not obtained yet, then "value". */
export function naturalAt(ctx: OfferContext, cat: Catalogue = DEFAULT_CATALOGUE): NaturalStep {
  for (const step of naturalSequence(cat)) {
    const card = cat.cards.find((c) => c.id === step.card);
    if (!isStepOwned(step, card, ctx)) return step;
  }
  const value = cat.cards.find((c) => c.effect.kind === 'value');
  if (!value) throw new Error('The catalogue has no value card');
  return { card: value.id, value: nextValue(ctx.maxExtraction) };
}

function isPrereqMet(p: Prereq, ctx: OfferContext): boolean {
  if ('building' in p) return ctx.unlockedBuildings.includes(p.building);
  if ('feature' in p) return ctx.unlockedFeatures.includes(p.feature);
  if ('value' in p) return ctx.maxExtraction >= p.value;
  if ('card' in p) return (ctx.picks[p.card] ?? 0) > 0;
  return ctx.level >= p.level;
}

/**
 * Can `card` appear in an offer? It must have a slot, meet its prerequisites and `minLevel`,
 * stay under `maxPicks`, and, for an unlock or a feature, not be obtained already.
 */
export function isAvailable(card: CardDef, ctx: OfferContext): boolean {
  if (card.slot === null) return false;
  if (card.minLevel !== undefined && ctx.level < card.minLevel) return false;
  if (card.maxPicks !== undefined && (ctx.picks[card.id] ?? 0) >= card.maxPicks) return false;
  const e = card.effect;
  if ((e.kind === 'unlock' || e.kind === 'feature') && isObtained(card, ctx)) return false;
  return (card.requires ?? []).every((p) => isPrereqMet(p, ctx));
}

/** Weight breakdown of `card`, given the id of the natural card. Ignores availability. */
function weigh(card: CardDef, ctx: OfferContext, naturalId: string, cat: Catalogue): WeightEntry {
  const curve = curveAt(card.weight, ctx.level) * weightScale(card.id, cat.tuning);
  let natural: number | null = null;
  let weight = curve;
  if (card.id === naturalId) {
    natural = Math.max(curve, curveAt(OFFERS.natural, ctx.level));
    weight = natural;
  }
  let guard = 1;
  for (const g of cat.guards) if (g.cards.includes(card.id) && g.when(ctx)) guard *= g.factor;
  weight *= guard;
  return { card: card.id, curve, natural, guard, weight };
}

/**
 * Weight of `card` at this offer (§3.3): its curve times its tuned scale (PLAN-objets §5),
 * raised to the natural weight `max(curve, natural)` if it is the natural card, then guards. Ignores availability (see `isAvailable`).
 */
export function cardWeight(
  card: CardDef,
  ctx: OfferContext,
  cat: Catalogue = DEFAULT_CATALOGUE,
): number {
  return weigh(card, ctx, naturalAt(ctx, cat).card, cat).weight;
}

/** Extra offer slots given by the meta cards already picked. */
function metaSlots(ctx: OfferContext, cat: Catalogue): OfferSlot[] {
  const extra: OfferSlot[] = [];
  for (const c of cat.cards) {
    if (c.effect.kind !== 'meta' || (ctx.picks[c.id] ?? 0) <= 0) continue;
    extra.push(...META_EFFECTS[c.effect.id].extraSlots);
  }
  return extra;
}

/** Slots of the offer, in draw order: Nombres, Atelier, then those added by meta cards. */
export function offerSlots(ctx: OfferContext, cat: Catalogue = DEFAULT_CATALOGUE): OfferSlot[] {
  return [...OFFERS.slots, ...metaSlots(ctx, cat)];
}

/** Native edition of a special building, drawn with SPECIAL_EDITION_ODDS. */
export function drawSpecialEdition(
  rng: Rng,
  odds: Readonly<Record<Edition, number>> = SPECIAL_EDITION_ODDS,
): Edition {
  const total = EDITIONS.reduce((sum, e) => sum + odds[e], 0);
  let r = rng() * total;
  for (const e of EDITIONS) {
    r -= odds[e];
    if (r < 0) return e;
  }
  return 'base';
}

/** Pick one entry in proportion to its weight. `entries` must have a positive total. */
function pickWeighted(rng: Rng, entries: readonly WeightEntry[]): WeightEntry | undefined {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

/** Edition and value carried by a drawn card. */
function toOfferCard(card: CardDef, ctx: OfferContext, rng: Rng): OfferCard {
  const e = card.effect;
  if (e.kind === 'special') return { card: card.id, edition: drawSpecialEdition(rng) };
  if (e.kind === 'edition') return { card: card.id, edition: e.edition };
  if (e.kind === 'value')
    return { card: card.id, edition: 'base', value: nextValue(ctx.maxExtraction) };
  return { card: card.id, edition: 'base' };
}

/**
 * Draw the offer of `ctx.level` (§3.3). Each slot draws among the available cards of its
 * slot (Joker: all), without repeating a card of this offer; an empty Nombres or Atelier slot
 * draws from the other one. RNG per slot: `mulberry32(hash2(seed ^ OFFER_SALT, level,
 * palier × 8 + i))`, so every palier of a level draws its own cards.
 */
export function drawOffer(ctx: OfferContext, cat: Catalogue = DEFAULT_CATALOGUE): Offer {
  const naturalId = naturalAt(ctx, cat).card;
  const available = cat.cards.filter((c) => isAvailable(c, ctx));
  const taken = new Set<string>();
  const cards: OfferCard[] = [];
  const slots: SlotDraw[] = [];

  const pool = (slot: OfferSlot): WeightEntry[] =>
    available
      .filter((c) => (slot === 'joker' || c.slot === slot) && !taken.has(c.id))
      .map((c) => weigh(c, ctx, naturalId, cat))
      .filter((w) => w.weight > 0);

  offerSlots(ctx, cat).forEach((slot, i) => {
    const rng = mulberry32(hash2(ctx.seed ^ OFFER_SALT, ctx.level, ctx.palier * 8 + i));
    let used: OfferSlot | null = slot;
    let weights = pool(slot);
    if (weights.length === 0 && slot !== 'joker') {
      used = slot === 'nombres' ? 'atelier' : 'nombres';
      weights = pool(used);
    }
    const picked = weights.length > 0 ? pickWeighted(rng, weights) : undefined;
    const def = picked && available.find((c) => c.id === picked.card);
    if (!def) {
      slots.push({ slot, pool: null, weights, card: null });
      return;
    }
    const card = toOfferCard(def, ctx, rng);
    taken.add(def.id);
    cards.push(card);
    slots.push({ slot, pool: used, weights, card });
  });
  return { level: ctx.level, cards, slots };
}

/** Buildings a card can stand on (start buildings and those unlocked by a card). */
function ordinaryBuildings(cards: readonly CardDef[]): Set<string> {
  const set = new Set<string>(START_BUILDINGS);
  for (const c of cards) if (c.effect.kind === 'unlock') set.add(c.effect.building);
  return set;
}

/**
 * Check a catalogue (§5.5): unique ids, known prerequisites, no dependency cycle, sound weight
 * curves, special cards only for limited buildings, edition cards with a real edition, and a
 * card for every LEVEL_TABLE reward. Returns the list of errors (empty = valid).
 */
export function validateCatalogue(cards: readonly CardDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of cards) {
    if (ids.has(c.id)) errors.push(`${c.id}: duplicate id`);
    ids.add(c.id);
  }
  const ordinary = ordinaryBuildings(cards);
  const features = new Set<string>();
  for (const c of cards) if (c.effect.kind === 'feature') features.add(c.effect.feature);

  for (const c of cards) {
    for (const p of c.requires ?? []) {
      if ('building' in p && !ordinary.has(p.building))
        errors.push(`${c.id}: no card unlocks building ${p.building}`);
      if ('feature' in p && !features.has(p.feature))
        errors.push(`${c.id}: no card unlocks feature ${p.feature}`);
      if ('card' in p && !ids.has(p.card)) errors.push(`${c.id}: unknown card ${p.card}`);
      if ('value' in p && !(p.value >= 1)) errors.push(`${c.id}: bad value prerequisite`);
      if ('level' in p && !(p.level >= 1)) errors.push(`${c.id}: bad level prerequisite`);
    }
    if (c.slot !== null && c.weight.length === 0) errors.push(`${c.id}: drawable without weight`);
    c.weight.forEach((pt, i) => {
      if (!Number.isFinite(pt.w) || pt.w < 0) errors.push(`${c.id}: negative weight`);
      const prev = c.weight[i - 1];
      if (prev && pt.level <= prev.level) errors.push(`${c.id}: curve levels not increasing`);
    });
    if (c.maxPicks !== undefined && !(Number.isInteger(c.maxPicks) && c.maxPicks >= 1))
      errors.push(`${c.id}: bad maxPicks`);
    if (c.minLevel !== undefined && !(c.minLevel >= 1)) errors.push(`${c.id}: bad minLevel`);
    const e = c.effect;
    if (e.kind === 'special') {
      if (ordinary.has(e.building)) errors.push(`${c.id}: special card for ordinary building`);
      if (!(Number.isInteger(e.count) && e.count >= 1)) errors.push(`${c.id}: bad count`);
    }
    if (e.kind === 'edition' && (e.edition as Edition) === 'base')
      errors.push(`${c.id}: edition card without edition`);
  }

  for (const def of LEVEL_TABLE)
    if (!cardForReward(def.reward, cards))
      errors.push(`no card for level reward ${JSON.stringify(def.reward)}`);

  errors.push(...findCycles(cards));
  return errors;
}

/** Dependency cycles: a card requires (transitively) a card that provides its own prerequisite. */
function findCycles(cards: readonly CardDef[]): string[] {
  const providers = (p: Prereq): string[] =>
    cards
      .filter((c) => {
        const e = c.effect;
        if ('building' in p) return e.kind === 'unlock' && e.building === p.building;
        if ('feature' in p) return e.kind === 'feature' && e.feature === p.feature;
        if ('card' in p) return c.id === p.card;
        if ('value' in p) return e.kind === 'value';
        return false;
      })
      .map((c) => c.id);
  const edges = new Map<string, string[]>();
  for (const c of cards) edges.set(c.id, (c.requires ?? []).flatMap(providers));

  const errors: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      errors.push(`dependency cycle: ${[...path, id].join(' → ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const next of edges.get(id) ?? []) visit(next, [...path, id]);
    state.set(id, 'done');
  };
  for (const c of cards) visit(c.id, []);
  return errors;
}
