import { DIRS, type Dir, DX, DY, key, opposite } from '../core/grid';
import { axisOf, hasOutput } from './entities';
import { isFeatureUnlocked } from './state';
import type { World } from './world';

function outputCount(outputs: number): number {
  let n = 0;
  for (let d = 0; d < 4; d++) if (outputs & (1 << d)) n++;
  return n;
}

export type PriorityResult = 'set' | 'cleared' | 'none';

/**
 * Toggle the priority of the belt tile `(x, y)` with respect to the multi-output source
 * feeding it (PLAN §6.6): a junction belt, or a building output face (extractor, operator
 * output). One priority per source; clicking the prioritised tile again clears it.
 */
export function togglePriorityAt(world: World, x: number, y: number): PriorityResult {
  if (!isFeatureUnlocked(world.state, 'priorities')) return 'none';
  if (!world.beltAt(x, y) && !world.bridgeAt(x, y)) return 'none';
  // 1. A junction belt next to us that outputs toward this tile.
  for (const d of DIRS) {
    // Source sits on side d of the target and pushes in direction opposite(d).
    const push = opposite(d);
    const src = world.laneAt(x + DX[d], y + DY[d], axisOf(push));
    if (!src || !hasOutput(src.belt, push) || outputCount(src.belt.outputs) < 2) continue;
    if (src.belt.priority === push) {
      src.belt.priority = null;
      return 'cleared';
    }
    src.belt.priority = push;
    return 'set';
  }
  // 2. A building output face touching this tile.
  for (const d of DIRS) {
    const face: Dir = opposite(d);
    const ref = world.portAt(x + DX[d], y + DY[d], face);
    if (!ref) continue;
    const kind = ref.port.kind;
    if (kind !== 'out' && kind !== 'O' && kind !== 'Q' && kind !== 'R') continue;
    const pk = key(ref.port.x, ref.port.y) * 4 + face;
    if (ref.building.priority === pk) {
      ref.building.priority = null;
      return 'cleared';
    }
    ref.building.priority = pk;
    return 'set';
  }
  return 'none';
}

/** Tiles that carry a priority diamond (the prioritised outputs' targets). */
export function priorityTiles(world: World): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [, b] of world.nodes()) {
    if (b.priority !== null && hasOutput(b, b.priority)) {
      out.push({ x: b.x + DX[b.priority], y: b.y + DY[b.priority] });
    }
  }
  for (const b of world.state.buildings.values()) {
    if (b.priority === null) continue;
    const tileKey = Math.floor(b.priority / 4);
    const face = (b.priority % 4) as Dir;
    const ports = world.buildingPorts.get(b.id) ?? [];
    const p = ports.find((q) => key(q.x, q.y) === tileKey && q.face === face);
    if (p) out.push({ x: p.x + DX[face], y: p.y + DY[face] });
  }
  return out;
}
