import { EDIT } from '../config/balance';
import { key } from '../core/grid';
import { type Building, footprintTiles } from '../sim/entities';
import type { World } from '../sim/world';

/** Tile rectangle, inclusive on both ends. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Selection rectangle dragged from `a` to `b` (PLAN §8.2). Each side is capped at
 * `max` tiles (128): the corner under the cursor stops following past that size.
 */
export function selectionRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  max: number = EDIT.maxSelection,
): Rect {
  const span = (from: number, to: number): [number, number] =>
    to >= from ? [from, Math.min(to, from + max - 1)] : [Math.max(to, from - max + 1), from];
  const [x0, x1] = span(a.x, b.x);
  const [y0, y1] = span(a.y, b.y);
  return { x0, y0, x1, y1 };
}

export function rectSize(r: Rect): { w: number; h: number } {
  return { w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Buildings with at least one tile in the rectangle. The hub is ignored (PLAN §4.2). */
export function buildingsInArea(world: World, r: Rect): Building[] {
  const out: Building[] = [];
  for (const b of world.buildingsInRect(r.x0, r.y0, r.x1, r.y1)) {
    if (b.type === 'hub') continue;
    if (footprintTiles(b.type, b.x, b.y, b.rot, b.mirror).some((t) => inRect(r, t.x, t.y)))
      out.push(b);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Belt and bridge tiles inside the rectangle, sorted by tile key (deterministic). */
export function tilesInArea(world: World, r: Rect): { belts: number[]; bridges: number[] } {
  const belts: number[] = [];
  const bridges: number[] = [];
  for (const b of world.beltsInRect(r.x0, r.y0, r.x1, r.y1))
    if (inRect(r, b.x, b.y)) belts.push(key(b.x, b.y));
  for (const b of world.bridgesInRect(r.x0, r.y0, r.x1, r.y1))
    if (inRect(r, b.x, b.y)) bridges.push(key(b.x, b.y));
  belts.sort((a, b) => a - b);
  bridges.sort((a, b) => a - b);
  return { belts, bridges };
}

/** Demolish every belt, bridge and building (except the hub) in the zone. */
export function demolishArea(world: World, r: Rect): number {
  let n = 0;
  for (const b of buildingsInArea(world, r)) if (world.removeBuilding(b.id)) n++;
  const { belts, bridges } = tilesInArea(world, r);
  for (const k of belts) {
    const b = world.state.belts.get(k);
    if (b && world.removeBelt(b.x, b.y)) n++;
  }
  for (const k of bridges) {
    const b = world.state.bridges.get(k);
    if (b && world.removeBridge(b.x, b.y)) n++;
  }
  return n;
}

/**
 * Empty the zone of numbers (PLAN §8.2, `C`): items on belts and bridges, operator buffers
 * and cycles, storage stock (its value is released), extractor accumulators. Buildings
 * stay. Returns the number of items removed.
 */
export function clearArea(world: World, r: Rect): number {
  let n = 0;
  for (const b of world.beltsInRect(r.x0, r.y0, r.x1, r.y1)) {
    if (inRect(r, b.x, b.y) && b.item) {
      b.item = null;
      n++;
    }
  }
  for (const br of world.bridgesInRect(r.x0, r.y0, r.x1, r.y1)) {
    if (!inRect(r, br.x, br.y)) continue;
    for (const lane of [br.h, br.v]) {
      if (lane?.item) {
        lane.item = null;
        n++;
      }
    }
  }
  for (const b of buildingsInArea(world, r)) {
    for (const buf of [b.inA, b.inB, b.out, b.outQ, b.outR]) {
      if (!buf) continue;
      n += buf.length;
      buf.length = 0;
    }
    if (b.cycle !== undefined) b.cycle = -1;
    if (b.extractAcc !== undefined) b.extractAcc = 0;
    if (b.type === 'storage') {
      n += b.storeCount ?? 0;
      b.storeCount = 0;
      b.storeValue = null;
    }
  }
  return n;
}
