import type { Feature, PlaceableType, Track } from '../config/balance';
import { TRACKS } from '../config/balance';
import { type BuildingType, isSpecial, SPECIAL_TYPES } from '../config/buildings';
import {
  CARDS,
  type Edition,
  EDITIONS,
  PASSIVE_EFFECTS,
  type PassiveId,
  SPECIAL_EDITIONS,
  type SpecialEdition,
} from '../config/cards';
import { editionCapable, snapNative, specialKey } from '../sim/inventory';
import { COORD_MAX, COORD_MIN, type Dir, type Rot } from '../core/grid';
import type { Clip } from '../sim/clip';
import { MAX_PALIERS, offerKey } from '../sim/state';

/**
 * Current save format version (PLAN §11.3). Bump it with a migration (§11.4). Version 2
 * adds the reward cards (PLAN-recompenses §5.1), version 3 the paliers (PLAN-paliers §3.2);
 * older saves are refused.
 */
export const SAVE_VERSION = 3;

/** An item on a belt or lane: value, progress, entry side. */
export type SavedItem = [value: number, progress: number, from: Dir | null];

export interface SavedBelt {
  x: number;
  y: number;
  outputs: number;
  rr: number;
  rrIn: number;
  priority: Dir | null;
  item: SavedItem | null;
}

export interface SavedLane {
  dir: Dir;
  rr: number;
  rrIn: number;
  item: SavedItem | null;
}

export interface SavedBridge {
  x: number;
  y: number;
  h: SavedLane | null;
  v: SavedLane | null;
}

export interface SavedBuilding {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  rot: Rot;
  mirror?: boolean;
  rrOut: number;
  priority: number | null;
  extractValue?: number;
  extractAcc?: number;
  inA?: number[];
  inB?: number[];
  out?: number[];
  outQ?: number[];
  outR?: number[];
  cycle?: number;
  storeValue?: number | null;
  storeCount?: number;
  edition?: SpecialEdition;
  /** Present (true) only for an edition applied from a card. */
  editionApplied?: boolean;
}

export interface SavedRequirement {
  value: number;
  required: number;
  delivered: number;
}

/** A card obtained (see `CardPick`). */
export interface SavedPick {
  level: number;
  palier?: number;
  card: string;
  edition: Edition;
  value?: number;
  tick: number;
}

/** A card of an offer (see `OfferCard`). */
export interface SavedOfferCard {
  card: string;
  edition: Edition;
  value?: number;
}

/** Version 3 of the save (PLAN §11.3). Deposits are never saved (rebuilt from the seed). */
export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  /** Informative (play time is derived from the tick counter). */
  playTimeMs: number;
  savedAt: string;
  level: number;
  levels: [target: number, quantity: number, final: boolean][];
  levelRequirement: SavedRequirement | null;
  finishedAtTick: number | null;
  maxExtraction: number;
  unlockedBuildings: PlaceableType[];
  unlockedFeatures: Feature[];
  upgrades: Record<Track, number>;
  upgradeSeqs: Record<Track, number[]>;
  upgradeReqs: Record<Track, SavedRequirement[]>;
  autoBuyUpgrades: boolean;
  totalDelivered: number;
  nextBuildingId: number;
  buildings: SavedBuilding[];
  belts: SavedBelt[];
  bridges: SavedBridge[];
  markers: { x: number; y: number; text: string }[];
  clipboard: Clip[];
  helpSeen: string[];
  picks: SavedPick[];
  pendingOffers: { level: number; palier: number }[];
  currentOffer: { level: number; palier: number; cards: SavedOfferCard[] } | null;
  editionCards: Record<SpecialEdition, number>;
  editionsLost: Record<SpecialEdition, number>;
  specials: Record<string, number>;
  passives: PassiveId[];
  /** Safety net counters by card id (PLAN-paliers §3.5). */
  pity: Record<string, number>;
  camera: { x: number; y: number; zoom: number };
}

/** Why a save is refused: invalid data, or a format this build no longer reads. */
export type SaveErrorReason = 'invalid' | 'outdated';

/** Raised when a save does not match the schema. Nothing is overwritten in that case. */
export class SaveError extends Error {
  constructor(
    readonly path: string,
    readonly reason: SaveErrorReason = 'invalid',
  ) {
    super(
      reason === 'outdated' ? `Unsupported save version at ${path}` : `Invalid save at ${path}`,
    );
  }
}

// ---- validation helpers ----------------------------------------------------

type Obj = Record<string, unknown>;

function fail(path: string): never {
  throw new SaveError(path);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path);
  return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path);
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path);
  return v;
}

function int(v: unknown, path: string, min = -(2 ** 53), max = 2 ** 53): number {
  const n = num(v, path);
  if (!Number.isInteger(n) || n < min || n > max) fail(path);
  return n;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path);
  return v;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) fail(path);
  return v as T;
}

const coord = (v: unknown, path: string): number => int(v, path, COORD_MIN, COORD_MAX);
const dir = (v: unknown, path: string): Dir => int(v, path, 0, 3) as Dir;
const dirOrNull = (v: unknown, path: string): Dir | null => (v === null ? null : dir(v, path));
const int32 = (v: unknown, path: string): number => int(v, path, -(2 ** 31), 2 ** 31 - 1);
const ints = (v: unknown, path: string): number[] =>
  arr(v, path).map((x, i) => int32(x, `${path}[${i}]`));

const PLACEABLE: readonly PlaceableType[] = [
  'extractor',
  'adder',
  'multiplier',
  'subtractor',
  'divider',
  'exponent',
  'storage',
  'bridge',
];
const FEATURES: readonly Feature[] = ['upgrades', 'priorities'];
const BUILDING_TYPES: readonly BuildingType[] = [
  'hub',
  'extractor',
  'adder',
  'multiplier',
  'subtractor',
  'divider',
  'exponent',
  'storage',
  ...SPECIAL_TYPES,
];

const CARD_IDS: readonly string[] = CARDS.map((c) => c.id);
const PASSIVES = Object.keys(PASSIVE_EFFECTS) as PassiveId[];
/** Keys of `specials`: `"type:edition"` for every special building of the catalogue. */
const SPECIAL_KEYS: readonly string[] = CARDS.flatMap(({ effect }) => {
  if (effect.kind !== 'special') return [];
  const type = effect.building;
  return EDITIONS.map((e) => `${type}:${e}`);
});

/** A card with its edition and optional value (offers and picks). */
function offerCard(v: unknown, path: string): SavedOfferCard {
  const o = obj(v, path);
  const c: SavedOfferCard = {
    card: oneOf(o['card'], CARD_IDS, `${path}.card`),
    edition: oneOf(o['edition'], EDITIONS, `${path}.edition`),
  };
  if (o['value'] !== undefined) c.value = int(o['value'], `${path}.value`, 1, 2 ** 31 - 1);
  return c;
}

function pick(v: unknown, path: string): SavedPick {
  const o = obj(v, path);
  const p: SavedPick = {
    level: int(o['level'], `${path}.level`, 0),
    ...offerCard(o, path),
    tick: int(o['tick'], `${path}.tick`, 0),
  };
  if (o['palier'] !== undefined) p.palier = int(o['palier'], `${path}.palier`, 1, MAX_PALIERS);
  return p;
}

function counts<K extends string>(
  v: unknown,
  keys: readonly K[],
  path: string,
  required: boolean,
): Record<K, number> {
  const o = obj(v, path);
  const out = {} as Record<K, number>;
  for (const k of Object.keys(o))
    if (!(keys as readonly string[]).includes(k)) fail(`${path}.${k}`);
  for (const k of keys) {
    if (o[k] === undefined && !required) continue;
    out[k] = int(o[k], `${path}.${k}`, 0);
  }
  return out;
}

function item(v: unknown, path: string): SavedItem | null {
  if (v === null) return null;
  const a = arr(v, path);
  if (a.length !== 3) fail(path);
  const progress = num(a[1], `${path}[1]`);
  if (progress < 0 || progress > 1) fail(`${path}[1]`);
  return [int32(a[0], `${path}[0]`), progress, dirOrNull(a[2], `${path}[2]`)];
}

function requirement(v: unknown, path: string): SavedRequirement {
  const o = obj(v, path);
  return {
    value: int32(o['value'], `${path}.value`),
    required: int(o['required'], `${path}.required`, 0),
    delivered: int(o['delivered'], `${path}.delivered`, 0),
  };
}

function perTrack<T>(v: unknown, path: string, f: (x: unknown, p: string) => T): Record<Track, T> {
  const o = obj(v, path);
  const out = {} as Record<Track, T>;
  for (const tr of TRACKS) out[tr] = f(o[tr], `${path}.${tr}`);
  return out;
}

function lane(v: unknown, path: string): SavedLane | null {
  if (v === null) return null;
  const o = obj(v, path);
  return {
    dir: dir(o['dir'], `${path}.dir`),
    rr: int(o['rr'], `${path}.rr`, 0),
    rrIn: int(o['rrIn'], `${path}.rrIn`, 0),
    item: item(o['item'], `${path}.item`),
  };
}

function building(v: unknown, path: string): SavedBuilding {
  const o = obj(v, path);
  const b: SavedBuilding = {
    id: int(o['id'], `${path}.id`, 0),
    type: oneOf(o['type'], BUILDING_TYPES, `${path}.type`),
    x: coord(o['x'], `${path}.x`),
    y: coord(o['y'], `${path}.y`),
    rot: int(o['rot'], `${path}.rot`, 0, 3) as Rot,
    rrOut: int(o['rrOut'], `${path}.rrOut`, 0),
    priority: o['priority'] === null ? null : int(o['priority'], `${path}.priority`, 0),
  };
  if (o['mirror'] !== undefined) b.mirror = bool(o['mirror'], `${path}.mirror`);
  if (o['extractValue'] !== undefined)
    b.extractValue = int32(o['extractValue'], `${path}.extractValue`);
  if (o['extractAcc'] !== undefined) b.extractAcc = num(o['extractAcc'], `${path}.extractAcc`);
  for (const k of ['inA', 'inB', 'out', 'outQ', 'outR'] as const) {
    if (o[k] !== undefined) b[k] = ints(o[k], `${path}.${k}`);
  }
  if (o['cycle'] !== undefined) b.cycle = num(o['cycle'], `${path}.cycle`);
  if (o['storeValue'] !== undefined) {
    b.storeValue = o['storeValue'] === null ? null : int32(o['storeValue'], `${path}.storeValue`);
  }
  if (o['storeCount'] !== undefined) b.storeCount = int(o['storeCount'], `${path}.storeCount`, 0);
  if (o['edition'] !== undefined) {
    b.edition = oneOf(o['edition'], SPECIAL_EDITIONS, `${path}.edition`);
    if (o['editionApplied'] === true) {
      // An edition card, on a building that takes one.
      if (!editionCapable(b.type)) fail(`${path}.edition`);
      b.editionApplied = true;
    } else if (o['editionApplied'] !== undefined || !isSpecial(b.type)) {
      // A native edition: only special buildings have one.
      fail(`${path}.edition`);
    }
  } else if (o['editionApplied'] !== undefined) {
    fail(`${path}.editionApplied`);
  }
  return b;
}

function clip(v: unknown, path: string): Clip {
  const o = obj(v, path);
  return {
    w: int(o['w'], `${path}.w`, 1),
    h: int(o['h'], `${path}.h`, 1),
    belts: arr(o['belts'], `${path}.belts`).map((x, i) => {
      const p = `${path}.belts[${i}]`;
      const b = obj(x, p);
      return {
        x: int(b['x'], `${p}.x`),
        y: int(b['y'], `${p}.y`),
        outputs: int(b['outputs'], `${p}.outputs`, 1, 15),
        priority: dirOrNull(b['priority'], `${p}.priority`),
      };
    }),
    bridges: arr(o['bridges'], `${path}.bridges`).map((x, i) => {
      const p = `${path}.bridges[${i}]`;
      const b = obj(x, p);
      return {
        x: int(b['x'], `${p}.x`),
        y: int(b['y'], `${p}.y`),
        h: dirOrNull(b['h'], `${p}.h`),
        v: dirOrNull(b['v'], `${p}.v`),
      };
    }),
    buildings: arr(o['buildings'], `${path}.buildings`).map((x, i) => {
      const p = `${path}.buildings[${i}]`;
      const b = obj(x, p);
      const pr = b['priority'] === null ? null : obj(b['priority'], `${p}.priority`);
      return {
        type: oneOf(
          b['type'],
          BUILDING_TYPES.filter((t) => t !== 'hub') as Exclude<BuildingType, 'hub'>[],
          `${p}.type`,
        ),
        x: int(b['x'], `${p}.x`),
        y: int(b['y'], `${p}.y`),
        rot: int(b['rot'], `${p}.rot`, 0, 3) as Rot,
        mirror: bool(b['mirror'], `${p}.mirror`),
        priority: pr
          ? {
              x: int(pr['x'], `${p}.priority.x`),
              y: int(pr['y'], `${p}.priority.y`),
              face: dir(pr['face'], `${p}.priority.face`),
            }
          : null,
        // The native edition of a special building (absent = base).
        ...(b['edition'] === undefined
          ? {}
          : { edition: clipEdition(b['edition'], b['type'], `${p}.edition`) }),
      };
    }),
  };
}

/** Native edition of a special building in a clip: refused on any other building. */
function clipEdition(v: unknown, type: unknown, path: string): SpecialEdition {
  const e = oneOf(v, SPECIAL_EDITIONS, path);
  if (typeof type !== 'string' || !isSpecial(type)) fail(path);
  return e;
}

function pendingOffer(v: unknown, path: string): { level: number; palier: number } {
  const o = obj(v, path);
  return {
    level: int(o['level'], `${path}.level`, 1),
    palier: int(o['palier'], `${path}.palier`, 1, MAX_PALIERS),
  };
}

function savedOffer(
  v: unknown,
  path: string,
): { level: number; palier: number; cards: SavedOfferCard[] } {
  const o = obj(v, path);
  return {
    ...pendingOffer(o, path),
    cards: arr(o['cards'], `${path}.cards`).map((x, i) => offerCard(x, `${path}.cards[${i}]`)),
  };
}

/**
 * Check that `raw` is a valid save of the current version and return a clean copy
 * (unknown fields dropped). Throws `SaveError` with the path of the first problem.
 */
export function validateSave(raw: unknown): SaveData {
  const o = obj(raw, '$');
  const version = int(o['version'], '$.version', 1);
  if (version !== SAVE_VERSION) fail('$.version');
  const cam = obj(o['camera'], '$.camera');
  const data: SaveData = {
    version,
    seed: int(o['seed'], '$.seed', 0, 2 ** 32 - 1),
    tick: int(o['tick'], '$.tick', 0),
    playTimeMs: num(o['playTimeMs'], '$.playTimeMs'),
    savedAt: str(o['savedAt'], '$.savedAt'),
    level: int(o['level'], '$.level', 1),
    levels: arr(o['levels'], '$.levels').map((x, i) => {
      const a = arr(x, `$.levels[${i}]`);
      return [
        int32(a[0], `$.levels[${i}][0]`),
        int(a[1], `$.levels[${i}][1]`, 0),
        bool(a[2], `$.levels[${i}][2]`),
      ];
    }),
    levelRequirement:
      o['levelRequirement'] === null
        ? null
        : requirement(o['levelRequirement'], '$.levelRequirement'),
    finishedAtTick:
      o['finishedAtTick'] === null ? null : int(o['finishedAtTick'], '$.finishedAtTick', 0),
    maxExtraction: int(o['maxExtraction'], '$.maxExtraction', 1),
    unlockedBuildings: arr(o['unlockedBuildings'], '$.unlockedBuildings').map((x, i) =>
      oneOf(x, PLACEABLE, `$.unlockedBuildings[${i}]`),
    ),
    unlockedFeatures: arr(o['unlockedFeatures'], '$.unlockedFeatures').map((x, i) =>
      oneOf(x, FEATURES, `$.unlockedFeatures[${i}]`),
    ),
    upgrades: perTrack(o['upgrades'], '$.upgrades', (x, p) => int(x, p, 1)),
    upgradeSeqs: perTrack(o['upgradeSeqs'], '$.upgradeSeqs', (x, p) =>
      arr(x, p).map((v, i) => int(v, `${p}[${i}]`)),
    ),
    upgradeReqs: perTrack(o['upgradeReqs'], '$.upgradeReqs', (x, p) =>
      arr(x, p).map((v, i) => requirement(v, `${p}[${i}]`)),
    ),
    autoBuyUpgrades: bool(o['autoBuyUpgrades'], '$.autoBuyUpgrades'),
    totalDelivered: int(o['totalDelivered'], '$.totalDelivered', 0),
    nextBuildingId: int(o['nextBuildingId'], '$.nextBuildingId', 1),
    buildings: arr(o['buildings'], '$.buildings').map((x, i) => building(x, `$.buildings[${i}]`)),
    belts: arr(o['belts'], '$.belts').map((x, i) => {
      const p = `$.belts[${i}]`;
      const b = obj(x, p);
      return {
        x: coord(b['x'], `${p}.x`),
        y: coord(b['y'], `${p}.y`),
        outputs: int(b['outputs'], `${p}.outputs`, 1, 15),
        rr: int(b['rr'], `${p}.rr`, 0),
        rrIn: int(b['rrIn'], `${p}.rrIn`, 0),
        priority: dirOrNull(b['priority'], `${p}.priority`),
        item: item(b['item'], `${p}.item`),
      };
    }),
    bridges: arr(o['bridges'], '$.bridges').map((x, i) => {
      const p = `$.bridges[${i}]`;
      const b = obj(x, p);
      return {
        x: coord(b['x'], `${p}.x`),
        y: coord(b['y'], `${p}.y`),
        h: lane(b['h'], `${p}.h`),
        v: lane(b['v'], `${p}.v`),
      };
    }),
    markers: arr(o['markers'], '$.markers').map((x, i) => {
      const p = `$.markers[${i}]`;
      const m = obj(x, p);
      return {
        x: coord(m['x'], `${p}.x`),
        y: coord(m['y'], `${p}.y`),
        text: str(m['text'], `${p}.text`),
      };
    }),
    clipboard: arr(o['clipboard'], '$.clipboard').map((x, i) => clip(x, `$.clipboard[${i}]`)),
    helpSeen: arr(o['helpSeen'], '$.helpSeen').map((x, i) => str(x, `$.helpSeen[${i}]`)),
    picks: arr(o['picks'], '$.picks').map((x, i) => pick(x, `$.picks[${i}]`)),
    pendingOffers: arr(o['pendingOffers'], '$.pendingOffers').map((x, i) =>
      pendingOffer(x, `$.pendingOffers[${i}]`),
    ),
    currentOffer:
      o['currentOffer'] === null ? null : savedOffer(o['currentOffer'], '$.currentOffer'),
    editionCards: counts(o['editionCards'], SPECIAL_EDITIONS, '$.editionCards', true),
    // Added within version 2 (unreleased): absent in earlier saves of it, meaning none.
    editionsLost:
      o['editionsLost'] === undefined
        ? { brillante: 0, legendaire: 0 }
        : counts(o['editionsLost'], SPECIAL_EDITIONS, '$.editionsLost', true),
    specials: counts(o['specials'], SPECIAL_KEYS, '$.specials', false),
    passives: arr(o['passives'], '$.passives').map((x, i) =>
      oneOf(x, PASSIVES, `$.passives[${i}]`),
    ),
    pity: counts(o['pity'], CARD_IDS, '$.pity', false),
    camera: {
      x: num(cam['x'], '$.camera.x'),
      y: num(cam['y'], '$.camera.y'),
      zoom: num(cam['zoom'], '$.camera.zoom'),
    },
  };
  // Structural consistency: exactly one hub, unique ids, one object per tile.
  const hubs = data.buildings.filter((b) => b.type === 'hub');
  if (hubs.length !== 1 || hubs[0]?.id !== 0) fail('$.buildings (hub)');
  const ids = new Set(data.buildings.map((b) => b.id));
  if (ids.size !== data.buildings.length) fail('$.buildings (ids)');
  if (data.buildings.some((b) => b.id >= data.nextBuildingId)) fail('$.nextBuildingId');
  // Pending offers: paliers reached (current level or earlier), in order; the stored offer is
  // the first one's.
  const pending = data.pendingOffers;
  if (
    pending.some(
      (p, i) => p.level > data.level || (i > 0 && offerKey(p) <= offerKey(pending[i - 1] ?? p)),
    )
  )
    fail('$.pendingOffers');
  const first = pending[0];
  if (
    data.currentOffer &&
    (data.currentOffer.level !== first?.level || data.currentOffer.palier !== first.palier)
  )
    fail('$.currentOffer.level');
  // Editions: never more applied (or lost) than obtained.
  for (const e of SPECIAL_EDITIONS) {
    const applied = data.buildings.filter((b) => b.edition === e && b.editionApplied).length;
    if (applied + data.editionsLost[e] > data.editionCards[e]) fail(`$.editionCards.${e}`);
  }
  // Special buildings: never more placed than obtained, edition by edition.
  const placed = new Map<string, number>();
  for (const b of data.buildings) {
    if (!isSpecial(b.type)) continue;
    const k = specialKey(b.type, snapNative(b.edition, b.editionApplied === true));
    placed.set(k, (placed.get(k) ?? 0) + 1);
  }
  for (const [k, n] of placed) if (n > (data.specials[k] ?? 0)) fail(`$.specials.${k}`);
  return data;
}
