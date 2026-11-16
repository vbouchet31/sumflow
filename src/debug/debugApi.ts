import { applyBeltPlan, computeLPath, planBeltPath } from '../build/beltPath';
import { applyBuildingPlan, planExtractor, planOperator } from '../build/placement';
import { TICK_RATE, type Track, TRACKS } from '../config/balance';
import { type Dir, normalizeRot, rotateDir } from '../core/grid';
import type { Camera } from '../render/camera';
import { dirMask, type OperatorType } from '../sim/entities';
import type { SimLoop } from '../sim/loop';
import { applyReward, deliver, setLevel } from '../sim/progression';
import { runTicks } from '../sim/tick';
import type { World } from '../sim/world';
import type { Deposit } from '../world/deposits';

export interface DebugContext {
  world: World;
  camera: Camera;
  loop: SimLoop;
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
  place: (type: 'belt' | 'extractor' | OperatorType, x: number, y: number, rot?: number) => boolean;
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
  const { world, camera, loop } = ctx;
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
        totalDelivered: s.totalDelivered,
        paused: loop.paused,
        camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      };
    },
    findDeposit: (value) => world.deposits.findNearest(value),
    depositAt: (x, y) => world.deposits.depositAt(x, y),
    place: (type, x, y, rot = 0) => {
      if (type === 'belt') {
        const dir: Dir = rotateDir(1, rot);
        world.setBelt(x, y, dirMask(dir));
        return true;
      }
      if (type === 'extractor')
        return applyBuildingPlan(world, planExtractor(world, x, y)) !== null;
      // Operators: (x, y) is the top-left corner after rotation (0 = as defined in PLAN §6.3).
      return applyBuildingPlan(world, planOperator(world, type, x, y, normalizeRot(rot))) !== null;
    },
    beltPath: (x1, y1, x2, y2, ctrl = false) =>
      applyBeltPlan(world, planBeltPath(world, computeLPath(x1, y1, x2, y2, ctrl))),
    step: (seconds) => runTicks(world, Math.round(seconds * TICK_RATE)),
    setTimeScale: (x) => {
      loop.timeScale = Math.min(50, Math.max(1, x));
    },
    setUpgrade: (track, level) => {
      if (TRACKS.includes(track)) world.state.upgrades[track] = Math.max(1, Math.floor(level));
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
