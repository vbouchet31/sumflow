import { clearArea, demolishArea, selectionRect } from '../build/area';
import { applyBeltPlan, computeLPath, planBeltPath } from '../build/beltPath';
import { applyPaste, planPaste, transformClip } from '../build/clipboard';
import type { ToolController } from '../build/tools';
import { applyBuildingPlan, planExtractor, planOperator } from '../build/placement';
import { type PlaceableType, TICK_RATE, type Track, TRACKS } from '../config/balance';
import type { Edition, SpecialEdition } from '../config/cards';
import { type Dir, normalizeRot, rotateDir } from '../core/grid';
import type { Camera } from '../render/camera';
import type { Effects } from '../render/layers/effects';
import { dirMask, type FreeBuildingType } from '../sim/entities';
import {
  appliedEditions,
  applyEdition,
  freeEditions,
  removeEdition,
  specialStock,
} from '../sim/inventory';
import { SPECIAL_TYPES } from '../config/buildings';
import type { SimLoop } from '../sim/loop';
import { drawOffer, nextValue, type OfferCard, type SlotDraw } from '../sim/offers';
import { chooseCard, deliver, ensureOffer, setLevel } from '../sim/progression';
import { cardDef, grantCard, grantedCard, offerContext } from '../sim/rewards';
import type { StoredOffer } from '../sim/state';
import { runTicks } from '../sim/tick';
import { setUpgradeLevel, syncUpgradeRequirements } from '../sim/upgrades';
import type { World } from '../sim/world';
import { layoutString } from '../sim/layout';
import type { SaveManager } from '../save/manager';
import { stateHash } from '../save/serialize';
import type { Deposit } from '../world/deposits';
import type { PerfMeter, PerfStats } from './perfMeter';
import { buildReferenceScenario, countItems, REFERENCE } from './reference';

export interface DebugContext {
  world: World;
  camera: Camera;
  loop: SimLoop;
  tools: ToolController;
  saves: SaveManager;
  perf: PerfMeter;
  effects: Effects;
}

export interface DebugSnapshot {
  seed: number;
  tick: number;
  level: number;
  maxExtraction: number;
  levelRequirement: { value: number; required: number; delivered: number } | null;
  unlockedBuildings: string[];
  unlockedFeatures: string[];
  finished: boolean;
  /** Completed levels whose offer is not chosen yet. */
  pendingLevels: number[];
  /** Cards obtained so far (fixed levels, offers, grants). */
  picks: number;
  /** Edition cards: obtained, free, applied on the map and lost (permanent editions). */
  editions: Record<'obtained' | 'free' | 'applied' | 'lost', Record<SpecialEdition, number>>;
  /** Special buildings by `"type:edition"`: copies obtained, placed on the map and free. */
  specials: Record<string, { obtained: number; placed: number; free: number }>;
  upgrades: Record<Track, number>;
  belts: number;
  bridges: number;
  buildings: number;
  items: number;
  markers: { x: number; y: number; text: string }[];
  clipboard: number;
  undo: number;
  redo: boolean;
  tool: string;
  /** Tile the tools consider hovered (null on a touch screen once the finger is up). */
  hover: { x: number; y: number } | null;
  /** Outline of the selected object (no tool), or null. */
  selection: { x0: number; y0: number; x1: number; y1: number } | null;
  totalDelivered: number;
  paused: boolean;
  camera: { x: number; y: number; zoom: number };
}

export interface DebugApi {
  getState: () => DebugSnapshot;
  findDeposit: (value: number) => Deposit | null;
  depositAt: (x: number, y: number) => Deposit | null;
  /**
   * Place a building. `belt`: one belt at (x, y) facing `rot` (0 = East, clockwise, like the
   * belt tool). `extractor`: snaps to the deposit covering (x, y). Operators: (x, y) is the
   * top-left corner, `rot` quarter turns clockwise; must be unlocked. A special building
   * takes a free copy of its native `edition` (base by default).
   */
  place: (
    type: 'belt' | 'extractor' | FreeBuildingType,
    x: number,
    y: number,
    rot?: number,
    edition?: SpecialEdition,
  ) => boolean;
  beltPath: (x1: number, y1: number, x2: number, y2: number, ctrl?: boolean) => number;
  /** Simulate `seconds` immediately (synchronously). */
  step: (seconds: number) => void;
  setTimeScale: (x: number) => void;
  setUpgrade: (track: Track, level: number) => void;
  deliver: (value: number, count: number) => void;
  /** Unlock every building, feature and extraction up to 80. */
  unlockAll: () => void;
  /** Jump to level `n`, granting the natural card of every level before it. */
  setLevel: (n: number) => void;
  /**
   * The offer of the first pending level (drawn now if needed), the pending levels, and the
   * weight breakdown of each slot as the draw computes it.
   */
  offer: () => { current: StoredOffer | null; pendingLevels: number[]; slots: SlotDraw[] };
  /**
   * Replace the current offer with these cards (special buildings take `edition`). Creates a
   * pending entry if none. Use `?pick=none`, or the automatic choice takes it on the next frame.
   */
  forceOffer: (cardIds: string[], edition?: Edition) => boolean;
  /** Take card `index` of the current offer. */
  choose: (index: number) => boolean;
  /** Give a card outside any offer. */
  grant: (cardId: string, edition?: Edition) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  /** Copy the zone (x0, y0)–(x1, y1) into the clipboard (switches to paste mode). */
  copy: (x0: number, y0: number, x1: number, y1: number, cut?: boolean) => boolean;
  /** Paste clipboard entry `index` with its top-left corner at (x, y). Returns objects placed. */
  paste: (x: number, y: number, rot?: number, mirror?: boolean, index?: number) => number;
  demolishArea: (x0: number, y0: number, x1: number, y1: number) => number;
  clearArea: (x0: number, y0: number, x1: number, y1: number) => number;
  setMarker: (x: number, y: number, text: string) => void;
  /** Output mask of the plain belt at (x, y) (bit d = direction d), or null. */
  beltAt: (x: number, y: number) => number | null;
  /** The building covering (x, y): its type, origin and rotation, or null. */
  buildingAt: (x: number, y: number) => { type: string; x: number; y: number; rot: number } | null;
  /** The building covering (x, y): its id and edition (null = base), or null. */
  editionAt: (
    x: number,
    y: number,
  ) => { id: number; edition: SpecialEdition | null; applied: boolean } | null;
  /** Apply a free edition card on building `id` (undoable, like the Edition tool). */
  applyEdition: (id: number, edition: SpecialEdition) => boolean;
  /** Take the applied edition of building `id` back (undoable). */
  removeEdition: (id: number) => boolean;
  /** Layout of every building except the hub, sorted (for comparisons in tests). */
  layout: () => string;
  /** Save now (compressed) and report the result. */
  save: () => Promise<string>;
  /** Hash of everything saved: equal before a save and after reloading it. */
  stateHash: () => string;
  /**
   * Build the reference factory of PLAN §10.4 (20 000 belts, 1 000 buildings, ~15 000
   * items) in the current game, warmed up. For a fresh game only.
   */
  loadReference: () => void;
  /** Frame timings of the last half second (the numbers of the F3 overlay). */
  perf: () => PerfStats;
  /** Move the camera (tiles) and optionally set the zoom. */
  lookAt: (x: number, y: number, zoom?: number) => void;
  /** Chalk effects alive (sponge traces and dust puffs) and their dust grains. */
  effects: () => { effects: number; grains: number };
}

declare global {
  interface Window {
    __sumflow?: DebugApi;
  }
}

export function isDebugEnabled(search: string): boolean {
  return import.meta.env.DEV || new URLSearchParams(search).get('debug') === '1';
}

/** Expose `window.__sumflow` (PLAN §13.4). Grows with each milestone. */
export function installDebugApi(ctx: DebugContext): void {
  const { world, camera, loop, tools, saves, perf, effects } = ctx;
  const { history } = tools;
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    selectionRect({ x: x0, y: y0 }, { x: x1, y: y1 });
  window.__sumflow = {
    getState: () => {
      const s = world.state;
      const items = countItems(world);
      return {
        seed: s.seed,
        tick: s.tick,
        level: s.level,
        maxExtraction: s.maxExtraction,
        levelRequirement: s.levelRequirement ? { ...s.levelRequirement } : null,
        unlockedBuildings: [...s.unlockedBuildings],
        unlockedFeatures: [...s.unlockedFeatures],
        finished: s.finishedAtTick !== null,
        pendingLevels: [...s.pendingLevels],
        picks: s.picks.length,
        editions: {
          obtained: { ...s.editionCards },
          free: freeEditions(s),
          applied: appliedEditions(s),
          lost: { ...s.editionsLost },
        },
        specials: Object.fromEntries(
          SPECIAL_TYPES.flatMap((type) =>
            specialStock(s, type).map((st) => [
              `${type}:${st.edition}`,
              { obtained: st.obtained, placed: st.placed, free: st.free },
            ]),
          ),
        ),
        upgrades: { ...s.upgrades },
        belts: s.belts.size,
        bridges: s.bridges.size,
        buildings: s.buildings.size,
        items,
        markers: [...s.markers.values()].map((m) => ({ ...m })),
        clipboard: s.clipboard.length,
        undo: history.undoSize,
        redo: history.canRedo,
        tool: tools.tool,
        hover: tools.hovered ? { ...tools.hovered } : null,
        selection: tools.selectionRect,
        totalDelivered: s.totalDelivered,
        paused: loop.paused,
        camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      };
    },
    findDeposit: (value) => world.deposits.findNearest(value),
    depositAt: (x, y) => world.deposits.depositAt(x, y),
    place: (type, x, y, rot = 0, edition) =>
      history.run(() => {
        if (type === 'belt') {
          const dir: Dir = rotateDir(1, rot);
          world.setBelt(x, y, dirMask(dir));
          return true;
        }
        if (type === 'extractor')
          return applyBuildingPlan(world, planExtractor(world, x, y)) !== null;
        // Operators: (x, y) is the top-left corner after rotation (0 = as defined in PLAN §6.3).
        const plan = planOperator(world, type, x, y, normalizeRot(rot), edition);
        return applyBuildingPlan(world, plan) !== null;
      }),
    beltPath: (x1, y1, x2, y2, ctrl = false) =>
      history.run(() =>
        applyBeltPlan(world, planBeltPath(world, computeLPath(x1, y1, x2, y2, ctrl))),
      ),
    undo: () => tools.undo(),
    redo: () => tools.redo(),
    copy: (x0, y0, x1, y1, cut = false) => tools.copyRect(rect(x0, y0, x1, y1), cut),
    paste: (x, y, rot = 0, mirror = false, index = 0) => {
      const src = world.state.clipboard[index];
      if (!src) return 0;
      const clip = transformClip(src, rot, mirror);
      return history.run(() => applyPaste(world, planPaste(world, clip, x, y)));
    },
    demolishArea: (x0, y0, x1, y1) => history.run(() => demolishArea(world, rect(x0, y0, x1, y1))),
    clearArea: (x0, y0, x1, y1) => clearArea(world, rect(x0, y0, x1, y1)),
    setMarker: (x, y, text) => tools.setMarker(x, y, text),
    beltAt: (x, y) => world.beltAt(x, y)?.outputs ?? null,
    buildingAt: (x, y) => {
      const b = world.buildingAt(x, y);
      return b ? { type: b.type, x: b.x, y: b.y, rot: b.rot } : null;
    },
    editionAt: (x, y) => {
      const b = world.buildingAt(x, y);
      if (!b) return null;
      return { id: b.id, edition: b.edition ?? null, applied: b.editionApplied === true };
    },
    applyEdition: (id, edition) => {
      const b = world.state.buildings.get(id);
      return b !== undefined && history.run(() => applyEdition(world, b, edition));
    },
    removeEdition: (id) => {
      const b = world.state.buildings.get(id);
      return b !== undefined && history.run(() => removeEdition(world, b));
    },
    layout: () => layoutString(world),
    save: () => saves.save(),
    stateHash: () => stateHash(world, camera),
    loadReference: () => {
      buildReferenceScenario(world);
      runTicks(world, REFERENCE.warmupSeconds * TICK_RATE);
    },
    perf: () => ({ ...perf.stats }),
    effects: () => {
      effects.prune(performance.now());
      return { effects: effects.size, grains: effects.grains };
    },
    lookAt: (x, y, zoom) => {
      camera.centerOn(x, y);
      if (zoom !== undefined) camera.zoomAt(camera.viewW / 2, camera.viewH / 2, zoom / camera.zoom);
    },
    step: (seconds) => runTicks(world, Math.round(seconds * TICK_RATE)),
    setTimeScale: (x) => {
      loop.timeScale = Math.min(50, Math.max(1, x));
    },
    setUpgrade: (track, level) => {
      if (TRACKS.includes(track)) setUpgradeLevel(world.state, track, level);
    },
    unlockAll: () => {
      const st = world.state;
      const all: PlaceableType[] = [
        'adder',
        'multiplier',
        'subtractor',
        'divider',
        'exponent',
        'storage',
        'bridge',
      ];
      for (const building of all)
        if (!st.unlockedBuildings.includes(building)) st.unlockedBuildings.push(building);
      for (const feature of ['upgrades', 'priorities'] as const)
        if (!st.unlockedFeatures.includes(feature)) st.unlockedFeatures.push(feature);
      st.maxExtraction = Math.max(st.maxExtraction, 80);
      st.naturalRefusals = 0; // the natural item moved on
      syncUpgradeRequirements(st);
    },
    offer: () => {
      const st = world.state;
      const current = ensureOffer(st, world.emit);
      const level = st.pendingLevels[0];
      const slots = level === undefined ? [] : drawOffer(offerContext(st, level)).slots;
      return {
        current: current && { level: current.level, cards: current.cards.map((c) => ({ ...c })) },
        pendingLevels: [...st.pendingLevels],
        slots,
      };
    },
    forceOffer: (cardIds, edition = 'base') => {
      const st = world.state;
      const cards: OfferCard[] = [];
      for (const id of cardIds) {
        const card = grantedCard(id, edition);
        if (!card) return false;
        if (cardDef(id)?.effect.kind === 'value') card.value = nextValue(st.maxExtraction);
        cards.push(card);
      }
      if (cards.length === 0) return false;
      if (st.pendingLevels.length === 0) st.pendingLevels.push(Math.max(1, st.level - 1));
      const level = st.pendingLevels[0] ?? 1;
      st.currentOffer = { level, cards };
      return true;
    },
    choose: (index) => chooseCard(world.state, index, world.emit),
    grant: (cardId, edition) => grantCard(world.state, cardId, edition) !== undefined,
    setLevel: (n) => setLevel(world.state, n),
    deliver: (value, count) => {
      for (let i = 0; i < count; i++) deliver(world.state, value, world.emit);
    },
  };
}
