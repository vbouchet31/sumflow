import { E, S, W } from '../core/grid';
import { dirMask } from '../sim/entities';
import type { World } from '../sim/world';

/**
 * Reference scenario of PLAN §10.4: 20 000 belt tiles, 1 000 buildings and about 15 000
 * items. Used by `npm run bench` and by `window.__sumflow.loadReference()` to measure the
 * frame rate in a browser.
 *
 * 250 identical modules on a 10 × 25 grid. In each module two extractors feed an adder
 * through 28-tile belts (which back up, full of waiting items), and the adder's results
 * travel 24 tiles to a storage:
 *
 * ```
 * [E1]→→→ 28 →→→[A|B]←←← 28 ←←←[E2]
 *        [St]←←← 22 ←←←←┘
 * ```
 */
export const REFERENCE = {
  columns: 10,
  rows: 25,
  /** Module pitch in tiles. */
  pitchX: 66,
  pitchY: 7,
  /** Top-left tile of the first module (clear of the hub). */
  originX: 12,
  originY: -87,
  /** Upgrade level of every track: a mid-game factory (belts at 4 tiles/s). */
  upgradeLevel: 4,
  /** Seconds to simulate before measuring, so belts are filled. */
  warmupSeconds: 40,
  beltsPerModule: 80,
  buildingsPerModule: 4,
} as const;

function buildModule(world: World, ox: number, oy: number): void {
  world.addBuilding('extractor', ox, oy, 0, { extractValue: 1 });
  world.addBuilding('extractor', ox + 61, oy, 0, { extractValue: 2 });
  world.addBuilding('adder', ox + 31, oy + 1, 0);
  world.addBuilding('storage', ox + 6, oy + 3, 0);
  for (let i = 0; i < 28; i++) {
    world.setBelt(ox + 3 + i, oy + 1, dirMask(E));
    world.setBelt(ox + 33 + i, oy + 1, dirMask(W));
  }
  world.setBelt(ox + 31, oy + 3, dirMask(S));
  for (let x = ox + 31; x >= ox + 9; x--) world.setBelt(x, oy + 4, dirMask(W));
}

/** Build the reference factory in `world` (expected to be a fresh game). */
export function buildReferenceScenario(world: World): void {
  const { upgrades } = world.state;
  for (const track of Object.keys(upgrades) as (keyof typeof upgrades)[]) {
    upgrades[track] = REFERENCE.upgradeLevel;
  }
  for (let row = 0; row < REFERENCE.rows; row++) {
    for (let col = 0; col < REFERENCE.columns; col++) {
      buildModule(
        world,
        REFERENCE.originX + col * REFERENCE.pitchX,
        REFERENCE.originY + row * REFERENCE.pitchY,
      );
    }
  }
}

/** Items currently on belts and bridge lanes. */
export function countItems(world: World): number {
  let n = 0;
  for (const [, belt] of world.nodes()) if (belt.item) n++;
  return n;
}
