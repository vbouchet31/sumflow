import { type Dir, E, isInBounds, key, N, S, W } from '../core/grid';
import { dirMask } from '../sim/entities';
import type { World } from '../sim/world';

export interface PathTile {
  x: number;
  y: number;
  /** Output direction toward the next tile (or of the last segment for the last tile). */
  dir: Dir;
}

/**
 * L-shaped path from `(x1, y1)` to `(x2, y2)` (PLAN §6.5): first along the axis with the
 * larger gap (horizontal on ties), then the other. `swapElbow` (Ctrl) inverts the order.
 * Returns an empty list when start and end are the same tile.
 */
export function computeLPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  swapElbow: boolean,
): PathTile[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return [];
  let horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  if (swapElbow) horizontalFirst = !horizontalFirst;
  const hDir: Dir = dx >= 0 ? E : W;
  const vDir: Dir = dy >= 0 ? S : N;
  const legs: { dir: Dir; len: number }[] = horizontalFirst
    ? [
        { dir: hDir, len: Math.abs(dx) },
        { dir: vDir, len: Math.abs(dy) },
      ]
    : [
        { dir: vDir, len: Math.abs(dy) },
        { dir: hDir, len: Math.abs(dx) },
      ];
  const tiles: PathTile[] = [];
  let x = x1;
  let y = y1;
  let lastDir: Dir = hDir;
  for (const leg of legs) {
    if (leg.len === 0) continue;
    lastDir = leg.dir;
    for (let i = 0; i < leg.len; i++) {
      tiles.push({ x, y, dir: leg.dir });
      if (leg.dir === E) x++;
      else if (leg.dir === W) x--;
      else if (leg.dir === S) y++;
      else y--;
    }
  }
  tiles.push({ x, y, dir: lastDir });
  return tiles;
}

/** Ghost colours: new = green, replace = orange, bridge = blue (M6), blocked = red. */
export type PlanStatus = 'new' | 'replace' | 'addOutput' | 'blocked';

export interface PlannedBelt extends PathTile {
  status: PlanStatus;
  /** Resulting output mask (meaningless when blocked). */
  outputs: number;
}

/**
 * Decide what each tile of a path does (PLAN §6.5). The first tile adds an output to an
 * existing belt (split) instead of replacing it. Buildings and the hub are skipped.
 */
export function planBeltPath(world: World, path: readonly PathTile[]): PlannedBelt[] {
  return path.map((t, i) => {
    if (!isInBounds(t.x, t.y) || world.occupancy.has(key(t.x, t.y))) {
      return { ...t, status: 'blocked', outputs: 0 };
    }
    const existing = world.beltAt(t.x, t.y);
    if (!existing) return { ...t, status: 'new', outputs: dirMask(t.dir) };
    if (i === 0 && path.length > 1) {
      return { ...t, status: 'addOutput', outputs: existing.outputs | dirMask(t.dir) };
    }
    return { ...t, status: 'replace', outputs: dirMask(t.dir) };
  });
}

/** Plan for a simple click: one belt facing `dir`, replacing any belt there. */
export function planSingleBelt(world: World, x: number, y: number, dir: Dir): PlannedBelt[] {
  if (!isInBounds(x, y) || world.occupancy.has(key(x, y))) {
    return [{ x, y, dir, status: 'blocked', outputs: 0 }];
  }
  const existing = world.beltAt(x, y);
  return [{ x, y, dir, status: existing ? 'replace' : 'new', outputs: dirMask(dir) }];
}

/** Apply a plan in one go. Returns the number of belts written. */
export function applyBeltPlan(world: World, plan: readonly PlannedBelt[]): number {
  let n = 0;
  for (const t of plan) {
    if (t.status === 'blocked') continue;
    const existing = world.beltAt(t.x, t.y);
    if (existing && existing.outputs === t.outputs) continue;
    world.setBelt(t.x, t.y, t.outputs);
    n++;
  }
  return n;
}
