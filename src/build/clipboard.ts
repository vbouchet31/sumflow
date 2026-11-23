import { BUILDINGS, isSpecial } from '../config/buildings';
import type { SpecialEdition } from '../config/cards';
import { EDIT } from '../config/balance';
import {
  type Dir,
  isInBounds,
  key,
  normalizeRot,
  type Rot,
  rotatedSize,
  transformDir,
  transformLocal,
  unkey,
} from '../core/grid';
import type { Clip, ClipBuilding } from '../sim/clip';
import { axisOf, buildingSize, footprintTiles } from '../sim/entities';
import { canPlaceType, freeSpecials, nativeEdition, specialKey } from '../sim/inventory';
import { isBuildingUnlocked } from '../sim/state';
import { singleOutput, type World } from '../sim/world';
import { isExtractable } from '../world/deposits';
import { buildingsInArea, type Rect, tilesInArea } from './area';

/**
 * Copy the layout of a zone (PLAN §8.2): belts, bridges and every building touching it,
 * the hub excepted. Coordinates become relative to the tight bounding box of what was
 * copied. Returns null when the zone holds nothing.
 */
export function copyArea(world: World, r: Rect): Clip | null {
  const buildings = buildingsInArea(world, r);
  const { belts, bridges } = tilesInArea(world, r);
  if (buildings.length + belts.length + bridges.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const k of [...belts, ...bridges]) {
    const p = unkey(k);
    grow(p.x, p.y);
  }
  for (const b of buildings)
    for (const t of footprintTiles(b.type, b.x, b.y, b.rot, b.mirror)) grow(t.x, t.y);
  const clip: Clip = {
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    belts: [],
    bridges: [],
    buildings: [],
  };
  for (const k of belts) {
    const b = world.state.belts.get(k);
    if (b)
      clip.belts.push({ x: b.x - minX, y: b.y - minY, outputs: b.outputs, priority: b.priority });
  }
  for (const k of bridges) {
    const br = world.state.bridges.get(k);
    if (!br) continue;
    clip.bridges.push({
      x: br.x - minX,
      y: br.y - minY,
      h: br.h ? singleOutput(br.h) : null,
      v: br.v ? singleOutput(br.v) : null,
    });
  }
  for (const b of buildings) {
    if (b.type === 'hub') continue;
    let priority: ClipBuilding['priority'] = null;
    if (b.priority !== null) {
      const p = unkey(Math.floor(b.priority / 4));
      priority = { x: p.x - minX, y: p.y - minY, face: (b.priority % 4) as Dir };
    }
    const entry: ClipBuilding = {
      type: b.type,
      x: b.x - minX,
      y: b.y - minY,
      rot: b.rot,
      mirror: b.mirror === true,
      priority,
    };
    const native = nativeEdition(b);
    if (isSpecial(b.type) && native !== 'base') entry.edition = native;
    clip.buildings.push(entry);
  }
  return clip;
}

function transformMask(mask: number, rot: number, mirror: boolean): number {
  let out = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) out |= 1 << transformDir(d as Dir, rot, mirror);
  return out;
}

/**
 * Rotate (`rot` clockwise quarter turns) and/or mirror (horizontally, applied first) a
 * clip. Buildings keep their port roles: a mirrored subtractor still computes A − B with
 * A and B at mirrored positions (PLAN §14 M9).
 */
export function transformClip(clip: Clip, rot: number, mirror: boolean): Clip {
  const r = normalizeRot(rot);
  if (r === 0 && !mirror) return clip;
  const size = rotatedSize(clip.w, clip.h, r);
  const tf = (x: number, y: number): { x: number; y: number } =>
    transformLocal(x, y, clip.w, clip.h, r, mirror);
  const tdir = (d: Dir | null): Dir | null => (d === null ? null : transformDir(d, r, mirror));
  return {
    w: size.w,
    h: size.h,
    belts: clip.belts.map((b) => ({
      ...tf(b.x, b.y),
      outputs: transformMask(b.outputs, r, mirror),
      priority: tdir(b.priority),
    })),
    bridges: clip.bridges.map((b) => {
      const lanes = [tdir(b.h), tdir(b.v)];
      const h = lanes.find((d) => d !== null && axisOf(d) === 0) ?? null;
      const v = lanes.find((d) => d !== null && axisOf(d) === 1) ?? null;
      return { ...tf(b.x, b.y), h, v };
    }),
    buildings: clip.buildings.map((b) => {
      const def = BUILDINGS[b.type];
      const bs = buildingSize(b.type, b.rot);
      const c0 = tf(b.x, b.y);
      const c1 = tf(b.x + bs.w - 1, b.y + bs.h - 1);
      // Orientation (mirror first, then rotate) composed with the paste transform.
      const bRot: Rot = def.rotatable ? normalizeRot(mirror ? r - b.rot : r + b.rot) : 0;
      const bMirror = def.rotatable ? b.mirror !== mirror : false;
      const out: ClipBuilding = {
        type: b.type,
        x: Math.min(c0.x, c1.x),
        y: Math.min(c0.y, c1.y),
        rot: bRot,
        mirror: bMirror,
        priority: b.priority
          ? { ...tf(b.priority.x, b.priority.y), face: transformDir(b.priority.face, r, mirror) }
          : null,
      };
      if (b.edition) out.edition = b.edition;
      return out;
    }),
  };
}

export type PasteStatus = 'new' | 'replace' | 'blocked';

export interface PastePlan {
  belts: { x: number; y: number; outputs: number; priority: Dir | null; status: PasteStatus }[];
  bridges: { x: number; y: number; h: Dir | null; v: Dir | null; status: PasteStatus }[];
  buildings: {
    type: ClipBuilding['type'];
    x: number;
    y: number;
    rot: Rot;
    mirror: boolean;
    /** Absolute port key of the prioritised face, or null. */
    priority: number | null;
    ok: boolean;
    /** Extractor: value of the deposit it lands on. */
    value?: number;
    /** Native edition of a special building (absent = base). */
    edition?: SpecialEdition;
  }[];
}

/**
 * Free copies of special buildings left for a paste, by `"type:edition"`: shared by the
 * copies of a row so that it stops at the last free one. Read from the map when first asked.
 */
export type SpecialBudget = Map<string, number>;

/**
 * Plan a paste of `clip` with its top-left corner at `(ox, oy)` (PLAN §8.2). Objects in
 * conflict (a building in the way, out of bounds, locked, an extractor not exactly on an
 * extractable deposit, or a special building without a free copy left in `budget`) are
 * marked blocked; the others are placed. Pasted belts and bridges replace existing ones.
 */
export function planPaste(
  world: World,
  clip: Clip,
  ox: number,
  oy: number,
  budget: SpecialBudget = new Map(),
): PastePlan {
  const { state } = world;
  const freeTile = (x: number, y: number): boolean =>
    isInBounds(x, y) && !world.occupancy.has(key(x, y));
  const tileStatus = (x: number, y: number): PasteStatus => {
    if (!freeTile(x, y)) return 'blocked';
    return world.beltAt(x, y) || world.bridgeAt(x, y) ? 'replace' : 'new';
  };
  const plan: PastePlan = { belts: [], bridges: [], buildings: [] };
  for (const b of clip.buildings) {
    const x = ox + b.x;
    const y = oy + b.y;
    const tiles = footprintTiles(b.type, x, y, b.rot, b.mirror);
    let ok = tiles.every((t) => freeTile(t.x, t.y));
    let value: number | undefined;
    if (b.type === 'extractor') {
      const d = world.deposits.depositAt(x + 1, y + 1);
      ok =
        ok &&
        d !== null &&
        d.x === x + 1 &&
        d.y === y + 1 &&
        isExtractable(d.value, state.maxExtraction);
      if (d) value = d.value;
    } else if (isSpecial(b.type)) {
      // Pasted with its native edition, only while a copy of it is free (no unlimited one).
      const k = specialKey(b.type, b.edition ?? 'base');
      const left = budget.get(k) ?? freeSpecials(state, k);
      ok = ok && left > 0;
      budget.set(k, ok ? left - 1 : left);
    } else {
      ok = ok && canPlaceType(state, b.type);
    }
    const priority = b.priority
      ? key(ox + b.priority.x, oy + b.priority.y) * 4 + b.priority.face
      : null;
    const entry: PastePlan['buildings'][number] = {
      type: b.type,
      x,
      y,
      rot: b.rot,
      mirror: b.mirror,
      priority,
      ok,
    };
    if (value !== undefined) entry.value = value;
    if (b.edition) entry.edition = b.edition;
    plan.buildings.push(entry);
  }
  for (const b of clip.belts) {
    const x = ox + b.x;
    const y = oy + b.y;
    plan.belts.push({ x, y, outputs: b.outputs, priority: b.priority, status: tileStatus(x, y) });
  }
  const bridgesOk = isBuildingUnlocked(state, 'bridge');
  for (const b of clip.bridges) {
    const x = ox + b.x;
    const y = oy + b.y;
    plan.bridges.push({ x, y, h: b.h, v: b.v, status: bridgesOk ? tileStatus(x, y) : 'blocked' });
  }
  return plan;
}

/** Apply a paste plan (non-blocked objects only). Returns the number of objects placed. */
export function applyPaste(world: World, plan: PastePlan): number {
  let n = 0;
  for (const b of plan.buildings) {
    // Re-check: an earlier copy of a row may now be in the way.
    if (!b.ok || !world.isFootprintFree(b.type, b.x, b.y, b.rot, b.mirror)) continue;
    const extra: { extractValue?: number; mirror?: boolean; native?: SpecialEdition } = {
      mirror: b.mirror,
    };
    if (b.type === 'extractor') {
      if (b.value === undefined) continue;
      extra.extractValue = b.value;
    }
    if (isSpecial(b.type)) {
      if (!canPlaceType(world.state, b.type, b.edition ?? 'base')) continue;
      if (b.edition) extra.native = b.edition;
    }
    const placed = world.addBuilding(b.type, b.x, b.y, b.rot, extra);
    if (
      b.priority !== null &&
      world.buildingPorts.get(placed.id)?.some((p) => key(p.x, p.y) * 4 + p.face === b.priority)
    ) {
      world.setBuildingPriority(placed, b.priority);
    }
    n++;
  }
  for (const b of plan.belts) {
    if (b.status === 'blocked' || world.occupancy.has(key(b.x, b.y))) continue;
    const belt = world.setBelt(b.x, b.y, b.outputs);
    world.setBeltPriority(belt, b.priority);
    n++;
  }
  for (const b of plan.bridges) {
    if (b.status === 'blocked' || world.occupancy.has(key(b.x, b.y))) continue;
    world.setBridge(b.x, b.y, b.h, b.v);
    n++;
  }
  return n;
}

/** Top-left corner that centres a clip on the cursor tile. */
export function pasteOrigin(clip: Clip, tx: number, ty: number): { x: number; y: number } {
  return { x: tx - Math.floor((clip.w - 1) / 2), y: ty - Math.floor((clip.h - 1) / 2) };
}

/** Most copies laid by one paste drag. */
export const MAX_PASTE_ROW = EDIT.maxPasteRow;

/**
 * Dragging in paste mode lays a row of copies spaced by the clip size along the dominant
 * axis (PLAN §8.2), centred on the start tile.
 */
export function planPasteRow(
  world: World,
  clip: Clip,
  from: { x: number; y: number },
  to: { x: number; y: number },
): PastePlan[] {
  const start = pasteOrigin(clip, from.x, from.y);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const step = horizontal ? clip.w : clip.h;
  const dist = horizontal ? dx : dy;
  const count = Math.min(MAX_PASTE_ROW, Math.floor(Math.abs(dist) / step) + 1);
  const sign = dist < 0 ? -1 : 1;
  const plans: PastePlan[] = [];
  const budget: SpecialBudget = new Map();
  for (let i = 0; i < count; i++) {
    const x = start.x + (horizontal ? sign * step * i : 0);
    const y = start.y + (horizontal ? 0 : sign * step * i);
    plans.push(planPaste(world, clip, x, y, budget));
  }
  return plans;
}

/** Add a clip at the front of the history (20 entries max, PLAN §8.2). */
export function pushClip(history: Clip[], clip: Clip): void {
  history.unshift(clip);
  if (history.length > EDIT.clipboardSize) history.length = EDIT.clipboardSize;
}
