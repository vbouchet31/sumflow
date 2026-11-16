import { clearArea, demolishArea, selectionRect } from '../build/area';
import { applyBeltPlan, computeLPath, planBeltPath } from '../build/beltPath';
import { applyPaste, planPaste, transformClip } from '../build/clipboard';
import type { ToolController } from '../build/tools';
import { applyBuildingPlan, planExtractor, planOperator } from '../build/placement';
import { TICK_RATE, type Track, TRACKS } from '../config/balance';
import { type Dir, normalizeRot, rotateDir } from '../core/grid';
import type { Camera } from '../render/camera';
import { dirMask, type FreeBuildingType } from '../sim/entities';
import type { SimLoop } from '../sim/loop';
import { applyReward, deliver, setLevel } from '../sim/progression';
import { runTicks } from '../sim/tick';
import { setUpgradeLevel } from '../sim/upgrades';
import type { World } from '../sim/world';
import { layoutString } from '../sim/layout';
import type { SaveManager } from '../save/manager';
import { stateHash } from '../save/serialize';
import type { Deposit } from '../world/deposits';

export interface DebugContext {
  world: World;
  camera: Camera;
  loop: SimLoop;
  tools: ToolController;
  saves: SaveManager;
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
   * top-left corner, `rot` quarter turns clockwise; must be unlocked.
   */
  place: (
    type: 'belt' | 'extractor' | FreeBuildingType,
    x: number,
    y: number,
    rot?: number,
  ) => boolean;
  beltPath: (x1: number, y1: number, x2: number, y2: number, ctrl?: boolean) => number;
  /** Simulate `seconds` immediately (synchronously). */
  step: (seconds: number) => void;
  setTimeScale: (x: number) => void;
  setUpgrade: (track: Track, level: number) => void;
  deliver: (value: number, count: number) => void;
  /** Unlock every building, feature and extraction up to 80. */
  unlockAll: () => void;
  /** Jump to level `n`, granting the rewards of every level before it. */
  setLevel: (n: number) => void;
  undo: () => boolean;
  redo: () => boolean;
  /** Copy the zone (x0, y0)–(x1, y1) into the clipboard (switches to paste mode). */
  copy: (x0: number, y0: number, x1: number, y1: number, cut?: boolean) => boolean;
  /** Paste clipboard entry `index` with its top-left corner at (x, y). Returns objects placed. */
  paste: (x: number, y: number, rot?: number, mirror?: boolean, index?: number) => number;
  demolishArea: (x0: number, y0: number, x1: number, y1: number) => number;
  clearArea: (x0: number, y0: number, x1: number, y1: number) => number;
  setMarker: (x: number, y: number, text: string) => void;
  /** Layout of every building except the hub, sorted (for comparisons in tests). */
  layout: () => string;
  /** Save now (compressed) and report the result. */
  save: () => Promise<string>;
  /** Hash of everything saved: equal before a save and after reloading it. */
  stateHash: () => string;
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
  const { world, camera, loop, tools, saves } = ctx;
  const { history } = tools;
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    selectionRect({ x: x0, y: y0 }, { x: x1, y: y1 });
  window.__sumflow = {
    getState: () => {
      const s = world.state;
      let items = 0;
      for (const b of s.belts.values()) if (b.item) items++;
      return {
        seed: s.seed,
        tick: s.tick,
        level: s.level,
        maxExtraction: s.maxExtraction,
        levelRequirement: s.levelRequirement ? { ...s.levelRequirement } : null,
        unlockedBuildings: [...s.unlockedBuildings],
        unlockedFeatures: [...s.unlockedFeatures],
        finished: s.finishedAtTick !== null,
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
        totalDelivered: s.totalDelivered,
        paused: loop.paused,
        camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      };
    },
    findDeposit: (value) => world.deposits.findNearest(value),
    depositAt: (x, y) => world.deposits.depositAt(x, y),
    place: (type, x, y, rot = 0) =>
      history.run(() => {
        if (type === 'belt') {
          const dir: Dir = rotateDir(1, rot);
          world.setBelt(x, y, dirMask(dir));
          return true;
        }
        if (type === 'extractor')
          return applyBuildingPlan(world, planExtractor(world, x, y)) !== null;
        // Operators: (x, y) is the top-left corner after rotation (0 = as defined in PLAN §6.3).
        const plan = planOperator(world, type, x, y, normalizeRot(rot));
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
    layout: () => layoutString(world),
    save: () => saves.save(),
    stateHash: () => stateHash(world, camera),
    step: (seconds) => runTicks(world, Math.round(seconds * TICK_RATE)),
    setTimeScale: (x) => {
      loop.timeScale = Math.min(50, Math.max(1, x));
    },
    setUpgrade: (track, level) => {
      if (TRACKS.includes(track)) setUpgradeLevel(world.state, track, level);
    },
    unlockAll: () => {
      for (const building of [
        'adder',
        'multiplier',
        'subtractor',
        'divider',
        'exponent',
        'storage',
        'bridge',
      ] as const)
        applyReward(world.state, { kind: 'building', building });
      applyReward(world.state, { kind: 'feature', feature: 'upgrades' });
      applyReward(world.state, { kind: 'feature', feature: 'priorities' });
      applyReward(world.state, { kind: 'extraction', max: 80 });
    },
    setLevel: (n) => setLevel(world.state, n),
    deliver: (value, count) => {
      for (let i = 0; i < count; i++) deliver(world.state, value, world.emit);
    },
  };
}
