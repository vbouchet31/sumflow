import type { BuildingType } from '../config/buildings';
import { buildingSize } from '../sim/entities';
import type { BuildingSnap, Change, TileSnap } from '../sim/journal';
import { unkey } from '../core/grid';
import type { Rect } from './area';

/** Ground covered by an object, in tiles (`x, y` top-left corner, `w × h`). */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
  type: BuildingType | 'belt' | 'bridge';
  /** Extractor: value of its deposit (its chalk colour). */
  value?: number;
}

/**
 * What an action did to the layout, for the chalk effects (DECISIONS "Effets craie"):
 * objects that appeared (built, pasted, moved there) and objects that went away. `area` is
 * the zone the player swept (zone demolition, cut, clear), if any.
 */
export interface Touched {
  placed: Footprint[];
  removed: Footprint[];
  area: Rect | null;
}

export const NOTHING_TOUCHED: Touched = { placed: [], removed: [], area: null };

function buildingFootprint(b: BuildingSnap): Footprint {
  const { w, h } = buildingSize(b.type, b.rot);
  const f: Footprint = { x: b.x, y: b.y, w, h, type: b.type };
  if (b.extractValue !== null) f.value = b.extractValue;
  return f;
}

/** The building was put somewhere else (moved, turned, mirrored), not only re-prioritised. */
function buildingMoved(a: BuildingSnap, b: BuildingSnap): boolean {
  return a.x !== b.x || a.y !== b.y || a.rot !== b.rot || a.mirror !== b.mirror;
}

/** The tile was drawn anew: a new object, or new belt directions or bridge lanes. */
function tileRedrawn(a: TileSnap | null, b: TileSnap): boolean {
  if (!a || a.kind !== b.kind) return true;
  if (a.kind === 'belt' && b.kind === 'belt') return a.outputs !== b.outputs;
  if (a.kind === 'bridge' && b.kind === 'bridge') return a.h !== b.h || a.v !== b.v;
  return false;
}

/**
 * Summarise a recorded change seen from `side`: `'after'` when it was just done (or redone),
 * `'before'` when it was undone (what it built goes away, what it removed comes back). A
 * change of priority alone touches nothing.
 */
export function touchedBy(change: Change, side: 'before' | 'after'): Touched {
  const touched: Touched = { placed: [], removed: [], area: null };
  const ends = <T>(s: { before: T | null; after: T | null }): [T | null, T | null] =>
    side === 'after' ? [s.before, s.after] : [s.after, s.before];
  for (const slot of change.buildings.values()) {
    const [from, to] = ends(slot);
    if (to && (!from || buildingMoved(from, to))) touched.placed.push(buildingFootprint(to));
    else if (from && !to) touched.removed.push(buildingFootprint(from));
  }
  for (const [k, slot] of change.tiles) {
    const [from, to] = ends(slot);
    const { x, y } = unkey(k);
    if (to && tileRedrawn(from, to)) touched.placed.push({ x, y, w: 1, h: 1, type: to.kind });
    else if (from && !to) touched.removed.push({ x, y, w: 1, h: 1, type: from.kind });
  }
  return touched;
}
