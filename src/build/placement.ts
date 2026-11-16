import type { BuildingType } from '../config/buildings';
import { key, type Rot } from '../core/grid';
import type { Building } from '../sim/entities';
import { HUB_ID } from '../sim/state';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';

export interface BuildingPlan {
  type: BuildingType;
  x: number;
  y: number;
  rot: Rot;
  ok: boolean;
  /** Extractor only: value of the deposit it covers. */
  value?: number;
}

/**
 * Extractor ghost for the tile under the cursor: it snaps onto the hovered deposit and is
 * valid only if that deposit is extractable and no building is in the way (PLAN §6.3).
 */
export function planExtractor(world: World, tx: number, ty: number): BuildingPlan {
  const d = world.deposits.depositAt(tx, ty);
  if (!d) return { type: 'extractor', x: tx - 1, y: ty - 1, rot: 0, ok: false };
  const x = d.x - 1;
  const y = d.y - 1;
  const ok =
    isExtractable(d.value, world.state.maxExtraction) &&
    world.isFootprintFree('extractor', x, y, 0);
  return { type: 'extractor', x, y, rot: 0, ok, value: d.value };
}

/** Place a planned building if valid. */
export function applyBuildingPlan(world: World, plan: BuildingPlan): Building | null {
  if (!plan.ok) return null;
  if (plan.type === 'extractor') {
    if (plan.value === undefined) return null;
    return world.addBuilding('extractor', plan.x, plan.y, 0, { extractValue: plan.value });
  }
  return world.addBuilding(plan.type, plan.x, plan.y, plan.rot);
}

/** What a demolition at `(x, y)` would remove. The hub is indestructible. */
export function demolishTarget(
  world: World,
  x: number,
  y: number,
): { kind: 'building'; id: number } | { kind: 'belt' } | null {
  const id = world.occupancy.get(key(x, y));
  if (id !== undefined) return id === HUB_ID ? null : { kind: 'building', id };
  return world.beltAt(x, y) ? { kind: 'belt' } : null;
}

/** Remove the building or belt at `(x, y)`. Items on it are lost. */
export function demolishAt(world: World, x: number, y: number): boolean {
  const target = demolishTarget(world, x, y);
  if (!target) return false;
  if (target.kind === 'building') return world.removeBuilding(target.id) !== null;
  return world.removeBelt(x, y) !== null;
}
