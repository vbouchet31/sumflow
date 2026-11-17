import { type MessageKey, t } from '../i18n';
import type { Change } from '../sim/journal';
import { unkey } from '../core/grid';
import { buildingSize } from '../sim/entities';

/** Tile rectangle (inclusive) of everything an action touched, and each touched rectangle. */
export interface ChangeArea {
  rects: { x: number; y: number; w: number; h: number }[];
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

export function changeArea(change: Change): ChangeArea {
  const rects: ChangeArea['rects'] = [];
  for (const k of change.tiles.keys()) rects.push({ ...unkey(k), w: 1, h: 1 });
  for (const k of change.markers.keys()) rects.push({ ...unkey(k), w: 1, h: 1 });
  for (const c of change.buildings.values()) {
    for (const snap of [c.before, c.after]) {
      if (!snap) continue;
      rects.push({ x: snap.x, y: snap.y, ...buildingSize(snap.type, snap.rot) });
    }
  }
  let bounds: ChangeArea['bounds'] = null;
  for (const r of rects) {
    bounds = bounds
      ? {
          x0: Math.min(bounds.x0, r.x),
          y0: Math.min(bounds.y0, r.y),
          x1: Math.max(bounds.x1, r.x + r.w - 1),
          y1: Math.max(bounds.y1, r.y + r.h - 1),
        }
      : { x0: r.x, y0: r.y, x1: r.x + r.w - 1, y1: r.y + r.h - 1 };
  }
  return { rects, bounds };
}

/**
 * What an action did, in a few signed counts: "Belt +14, Adder −1, 2 changed". Describes
 * the action as it was first done (before → after), whatever the direction it is replayed.
 */
export function summarizeChange(change: Change): string {
  const added = new Map<string, number>();
  const removed = new Map<string, number>();
  let changed = 0;
  const count = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
  for (const c of change.tiles.values()) {
    const kind = (c.after ?? c.before)?.kind === 'bridge' ? 'bridge' : 'belt';
    if (!c.before) count(added, kind);
    else if (!c.after) count(removed, kind);
    else changed++;
  }
  for (const c of change.buildings.values()) {
    const type = (c.after ?? c.before)?.type ?? 'belt';
    if (!c.before) count(added, type);
    else if (!c.after) count(removed, type);
    else changed++;
  }
  for (const c of change.markers.values()) {
    if (!c.before) count(added, 'marker');
    else if (!c.after) count(removed, 'marker');
    else changed++;
  }
  const name = (k: string): string => t(`tool.${k}` as MessageKey);
  const parts: string[] = [];
  for (const [k, n] of added) parts.push(`${name(k)} +${n}`);
  for (const [k, n] of removed) parts.push(`${name(k)} −${n}`);
  if (changed > 0) parts.push(t('undo.changed', { n: changed }));
  return parts.join(', ');
}
