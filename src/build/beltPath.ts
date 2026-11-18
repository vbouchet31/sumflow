import { DIRS, type Dir, DX, DY, E, isInBounds, key, N, opposite, S, W } from '../core/grid';
import { axisOf, type Belt, hasOutput } from '../sim/entities';
import { isBuildingUnlocked } from '../sim/state';
import { singleOutput } from '../sim/world';
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

/** Ghost colours: new = green, replace = orange, bridge = blue, blocked = red. */
export type PlanStatus = 'new' | 'replace' | 'addOutput' | 'bridge' | 'blocked';

export interface PlannedBelt extends PathTile {
  status: PlanStatus;
  /** Resulting output mask (meaningless when blocked). */
  outputs: number;
}

/**
 * A straight belt: one output, and nothing feeding it except from straight behind
 * (PLAN §6.5: "une seule entrée, une sortie opposée").
 */
export function isStraightBelt(world: World, b: Belt): Dir | null {
  const d = singleOutput(b);
  if (d === null) return null;
  for (const side of DIRS) {
    if (side === d || side === opposite(d)) continue;
    const n = world.laneAt(b.x + DX[side], b.y + DY[side], axisOf(opposite(side)));
    if (n && hasOutput(n.belt, opposite(side))) return null;
  }
  return d;
}

/**
 * Decide what each tile of a path does (PLAN §6.5). The first tile adds an output to an
 * existing belt (split) instead of replacing it. Buildings and the hub are skipped. Once
 * bridges are unlocked, crossing a straight perpendicular belt (or a bridge) straight on
 * makes a bridge.
 */
export function planBeltPath(world: World, path: readonly PathTile[]): PlannedBelt[] {
  const bridges = isBuildingUnlocked(world.state, 'bridge');
  return path.map((t, i) => {
    if (!isInBounds(t.x, t.y) || world.occupancy.has(key(t.x, t.y))) {
      return { ...t, status: 'blocked', outputs: 0 };
    }
    const prev = path[i - 1];
    const straightThrough = i > 0 && prev?.dir === t.dir;
    if (world.bridgeAt(t.x, t.y)) {
      return straightThrough && bridges
        ? { ...t, status: 'bridge', outputs: dirMask(t.dir) }
        : { ...t, status: 'replace', outputs: dirMask(t.dir) };
    }
    const existing = world.beltAt(t.x, t.y);
    if (existing && bridges && straightThrough) {
      const d = isStraightBelt(world, existing);
      if (d !== null && axisOf(d) !== axisOf(t.dir)) {
        return { ...t, status: 'bridge', outputs: dirMask(t.dir) };
      }
    }
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
    if (t.status === 'bridge') {
      const horizontal = axisOf(t.dir) === 0;
      world.setBridge(t.x, t.y, horizontal ? t.dir : undefined, horizontal ? undefined : t.dir);
      n++;
      continue;
    }
    const existing = world.beltAt(t.x, t.y);
    if (existing && existing.outputs === t.outputs) continue;
    world.setBelt(t.x, t.y, t.outputs);
    n++;
  }
  return n;
}

/**
 * Manual bridge (PLAN §6.7, tool 9): lane directions come from neighbouring belts feeding
 * the tile, then from the rotation (`dir`) for its axis, then East / South. A straight belt
 * already on the tile keeps its lane. Returns null when impossible.
 */
export function planManualBridge(
  world: World,
  x: number,
  y: number,
  dir: Dir,
): { h: Dir; v: Dir } | null {
  if (!isInBounds(x, y) || world.occupancy.has(key(x, y)) || world.bridgeAt(x, y)) return null;
  const fed = (axis: 0 | 1): Dir | null => {
    for (const side of DIRS) {
      const push = opposite(side);
      if (axisOf(push) !== axis) continue;
      const n = world.laneAt(x + DX[side], y + DY[side], axis);
      if (n && hasOutput(n.belt, push)) return push;
    }
    return null;
  };
  const existing = world.beltAt(x, y);
  const keep = existing ? isStraightBelt(world, existing) : null;
  if (existing && keep === null) return null;
  const h = keep !== null && axisOf(keep) === 0 ? keep : (fed(0) ?? (axisOf(dir) === 0 ? dir : E));
  const v = keep !== null && axisOf(keep) === 1 ? keep : (fed(1) ?? (axisOf(dir) === 1 ? dir : S));
  return { h, v };
}

/**
 * Freehand belt tracing: add the tile under the pointer to the trail of tiles the drag went
 * through. Going back over the trail cuts it there (undo the last steps, or close a loop
 * short). A pointer that skipped tiles (fast move) is joined with an L, larger gap first.
 */
export function extendTrail(trail: { x: number; y: number }[], x: number, y: number): void {
  const step = (tx: number, ty: number): void => {
    const at = trail.findIndex((t) => t.x === tx && t.y === ty);
    if (at >= 0) {
      trail.length = at + 1;
      return;
    }
    trail.push({ x: tx, y: ty });
  };
  const last = trail[trail.length - 1];
  if (!last) {
    trail.push({ x, y });
    return;
  }
  if (last.x === x && last.y === y) return;
  for (const t of computeLPath(last.x, last.y, x, y, false).slice(1)) step(t.x, t.y);
}

/**
 * Belt path along a trail: each tile faces the next one, the last keeps the direction of
 * the step into it. A single tile faces `dir`.
 */
export function trailPath(trail: readonly { x: number; y: number }[], dir: Dir): PathTile[] {
  const tiles: PathTile[] = [];
  let last: Dir = dir;
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i] as { x: number; y: number };
    const next = trail[i + 1];
    if (next) last = stepDir(t, next);
    tiles.push({ x: t.x, y: t.y, dir: last });
  }
  return tiles;
}

function stepDir(a: { x: number; y: number }, b: { x: number; y: number }): Dir {
  if (b.x > a.x) return E;
  if (b.x < a.x) return W;
  return b.y > a.y ? S : N;
}
