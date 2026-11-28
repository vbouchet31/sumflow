/**
 * Tuned values (PLAN-objets §5): the knobs a tuner may turn, object by object, with their
 * bounds. An object is a card of the catalogue, named by its card id.
 *
 * - The knobs and their bounds are declared here, in code: the tuner reads them, never
 *   writes them.
 * - Their values live in `tuning.json`, the only file `npm run tune -- <id> --apply` writes
 *   (in the format of `serializeTuning`). The game reads them through the functions below;
 *   with every value at its default (1) the game is exactly the untuned one.
 */
import type { OperatorType, SpecialType } from './buildings';
import { CARDS, type CardDef } from './cards';
import tunedFile from './tuning.json';

/** Path of the values file, from the repository root (for the tuner). */
export const TUNING_FILE = 'src/config/tuning.json';

export type KnobId = 'weightScale' | 'speed';
export const KNOB_IDS: readonly KnobId[] = ['weightScale', 'speed'];

export interface KnobSpec {
  /** Neutral value: the game as designed before any tuning. */
  default: number;
  min: number;
  max: number;
}

/**
 * Standard bounds of each knob:
 * - `weightScale`: factor on the card's weight curve (§3.2 of PLAN-recompenses), every drawn
 *   card; the natural ("fil rouge") floor is not scaled;
 * - `speed`: factor on the operations per second of a special building, on top of its track
 *   (upgrades), the passives and its edition; cards granting a special building.
 */
export const KNOB_KINDS: Readonly<Record<KnobId, KnobSpec>> = {
  weightScale: { default: 1, min: 0.2, max: 3 },
  speed: { default: 1, min: 0.3, max: 1.5 },
};

/** Bounds of one object narrowed or widened from the standard ones, argued in its fiche. */
export const KNOB_OVERRIDES: Readonly<Record<string, Partial<Record<KnobId, Partial<KnobSpec>>>>> =
  {};

export type ObjectKnobs = Readonly<Partial<Record<KnobId, KnobSpec>>>;

/** Knobs of a card: `weightScale` if it is drawn, `speed` if it grants a special building. */
function cardKnobs(card: CardDef): ObjectKnobs {
  const kinds: KnobId[] = [];
  if (card.drawable) kinds.push('weightScale');
  if (card.effect.kind === 'special') kinds.push('speed');
  const over = KNOB_OVERRIDES[card.id] ?? {};
  return Object.fromEntries(kinds.map((k) => [k, { ...KNOB_KINDS[k], ...over[k] }]));
}

/** Knobs of every object that has one, by card id, in catalogue order. */
export function knobsOf(cards: readonly CardDef[]): Readonly<Record<string, ObjectKnobs>> {
  const out: Record<string, ObjectKnobs> = {};
  for (const c of cards) {
    const k = cardKnobs(c);
    if (Object.keys(k).length > 0) out[c.id] = k;
  }
  return out;
}

export const KNOBS = knobsOf(CARDS);

/** Knob values by object id. A missing value is the knob's default. */
export type TuningValues = Readonly<Record<string, Readonly<Partial<Record<KnobId, number>>>>>;

/** Content of `tuning.json`. */
export interface TuningFile {
  $comment: string;
  objects: TuningValues;
}

export const TUNING_COMMENT =
  'Tuned values (PLAN-objets §5), read by src/config/tuning.ts which holds the knobs and their bounds. Only npm run tune -- <id> --apply rewrites this file.';

/** The values the game plays with. */
export const TUNED: TuningValues = (tunedFile as TuningFile).objects;

/** Value of knob `knob` of object `id`: the stored one, else its default. */
export function knobValue(
  id: string,
  knob: KnobId,
  values: TuningValues = TUNED,
  knobs: Readonly<Record<string, ObjectKnobs>> = KNOBS,
): number {
  return values[id]?.[knob] ?? knobs[id]?.[knob]?.default ?? KNOB_KINDS[knob].default;
}

/** Factor on the weight curve of card `cardId`. */
export function weightScale(cardId: string, values: TuningValues = TUNED): number {
  return knobValue(cardId, 'weightScale', values);
}

/** The card granting each special building (its `speed` knob is tuned there). */
const SPECIAL_CARD: Partial<Record<string, string>> = Object.fromEntries(
  CARDS.flatMap((c) => (c.effect.kind === 'special' ? [[c.effect.building, c.id]] : [])),
);

/** Factor on the speed of special building `type` (1 when no card grants it). */
export function specialSpeedFactor(type: SpecialType, values: TuningValues = TUNED): number {
  const card = SPECIAL_CARD[type];
  return card === undefined ? 1 : knobValue(card, 'speed', values);
}

/** Tuned speed factor of any computing building: 1 for the ordinary operators. */
export function operatorSpeedFactor(type: OperatorType, values: TuningValues = TUNED): number {
  return Object.hasOwn(SPECIAL_CARD, type)
    ? specialSpeedFactor(type as SpecialType, values)
    : KNOB_KINDS.speed.default;
}

/** Errors in the knob declarations: bad bounds, a special building tuned by two cards. */
export function validateKnobs(
  knobs: Readonly<Record<string, ObjectKnobs>> = KNOBS,
  cards: readonly CardDef[] = CARDS,
): string[] {
  const errors: string[] = [];
  for (const [id, list] of Object.entries(knobs)) {
    for (const k of KNOB_IDS) {
      const s = list[k];
      if (!s) continue;
      if (!(s.min > 0 && s.min <= s.default && s.default <= s.max)) {
        errors.push(`${id}.${k}: bounds must satisfy 0 < min <= default <= max`);
      }
    }
  }
  for (const id of Object.keys(KNOB_OVERRIDES)) {
    if (!knobs[id]) errors.push(`${id}: override of an object without knobs`);
  }
  const granted = new Map<string, string>();
  for (const c of cards) {
    if (c.effect.kind !== 'special') continue;
    const first = granted.get(c.effect.building);
    if (first !== undefined) {
      errors.push(`${c.effect.building}: speed tuned by both ${first} and ${c.id}`);
    }
    granted.set(c.effect.building, c.id);
  }
  return errors;
}

/** Errors in a set of values: unknown object or knob, missing, non-finite, out of bounds. */
export function validateTuning(
  values: TuningValues,
  knobs: Readonly<Record<string, ObjectKnobs>> = KNOBS,
): string[] {
  const errors: string[] = [];
  for (const [id, v] of Object.entries(values)) {
    const list = knobs[id];
    if (!list) {
      errors.push(`${id}: unknown object`);
      continue;
    }
    for (const k of Object.keys(v)) {
      if (!(KNOB_IDS as readonly string[]).includes(k) || !list[k as KnobId]) {
        errors.push(`${id}.${k}: unknown knob`);
      }
    }
  }
  for (const [id, list] of Object.entries(knobs)) {
    for (const k of KNOB_IDS) {
      const s = list[k];
      if (!s) continue;
      const v = values[id]?.[k];
      if (v === undefined) errors.push(`${id}.${k}: missing`);
      else if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`${id}.${k}: not a finite number`);
      } else if (v < s.min || v > s.max) {
        errors.push(`${id}.${k}: ${v} outside [${s.min}, ${s.max}]`);
      }
    }
  }
  return errors;
}

/**
 * Values with every knob at its default, in catalogue order: the untuned game. A new object
 * starts from these.
 */
export function defaultTuning(
  knobs: Readonly<Record<string, ObjectKnobs>> = KNOBS,
): Record<string, Partial<Record<KnobId, number>>> {
  const out: Record<string, Partial<Record<KnobId, number>>> = {};
  for (const [id, list] of Object.entries(knobs)) {
    const v: Partial<Record<KnobId, number>> = {};
    for (const k of KNOB_IDS) {
      const s = list[k];
      if (s) v[k] = s.default;
    }
    out[id] = v;
  }
  return out;
}

/**
 * Exact text of `tuning.json` for `values` (what the tuner writes): objects and knobs in
 * declaration order, two-space JSON, final newline. A unit test keeps the file in this form.
 */
export function serializeTuning(
  values: TuningValues,
  knobs: Readonly<Record<string, ObjectKnobs>> = KNOBS,
): string {
  const objects: Record<string, Partial<Record<KnobId, number>>> = {};
  for (const [id, list] of Object.entries(knobs)) {
    const v: Partial<Record<KnobId, number>> = {};
    for (const k of KNOB_IDS) {
      if (list[k]) v[k] = knobValue(id, k, values, knobs);
    }
    objects[id] = v;
  }
  const file: TuningFile = { $comment: TUNING_COMMENT, objects };
  return `${JSON.stringify(file, null, 2)}\n`;
}
