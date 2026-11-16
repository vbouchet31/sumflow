import type { BuildingType } from '../config/buildings';
import { isInBounds, key, type Rot } from '../core/grid';
import { buildingSize, footprintTiles, type FreeBuildingType } from '../sim/entities';
import type { Building } from '../sim/entities';
import { isBuildingUnlocked } from '../sim/state';
import { HUB_ID } from '../sim/state';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';

export interface BuildingPlan {
  type: BuildingType;
  x: number;
  y: number;
  rot: Rot;
  /** Mirrored before rotation (paste preview only). */
  mirror?: boolean;
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

/** Origin that centres a rotated footprint on the cursor tile. */
export function centredOrigin(
  type: BuildingType,
  tx: number,
  ty: number,
  rot: Rot,
): { x: number; y: number } {
  const size = buildingSize(type, rot);
  return { x: tx - Math.floor((size.w - 1) / 2), y: ty - Math.floor((size.h - 1) / 2) };
}

/** Operator or storage ghost at origin `(x, y)`: valid if unlocked, in bounds and free of buildings. */
export function planOperator(
  world: World,
  type: FreeBuildingType,
  x: number,
  y: number,
  rot: Rot,
): BuildingPlan {
  const ok =
    isBuildingUnlocked(world.state, type) &&
    footprintTiles(type, x, y, rot).every((t) => isInBounds(t.x, t.y)) &&
    world.isFootprintFree(type, x, y, rot);
  return { type, x, y, rot, ok };
}

/**
 * Dragging a building lays a row of copies spaced by its size along the dominant axis
 * (PLAN §8.2). Returns plans in order; overlapping or blocked ones are marked not ok.
 */
export function planOperatorRow(
  world: World,
  type: FreeBuildingType,
  from: { x: number; y: number },
  to: { x: number; y: number },
  rot: Rot,
): BuildingPlan[] {
  const size = buildingSize(type, rot);
  const start = centredOrigin(type, from.x, from.y, rot);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const step = horizontal ? size.w : size.h;
  const dist = horizontal ? dx : dy;
  const count = Math.floor(Math.abs(dist) / step) + 1;
  const sign = dist < 0 ? -1 : 1;
  const plans: BuildingPlan[] = [];
  for (let i = 0; i < count; i++) {
    const x = start.x + (horizontal ? sign * step * i : 0);
    const y = start.y + (horizontal ? 0 : sign * step * i);
    plans.push(planOperator(world, type, x, y, rot));
  }
  return plans;
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
): { kind: 'building'; id: number } | { kind: 'belt' } | { kind: 'bridge' } | null {
  const id = world.occupancy.get(key(x, y));
  if (id !== undefined) return id === HUB_ID ? null : { kind: 'building', id };
  if (world.bridgeAt(x, y)) return { kind: 'bridge' };
  return world.beltAt(x, y) ? { kind: 'belt' } : null;
}

/** Remove the building or belt at `(x, y)`. Items on it are lost. */
export function demolishAt(world: World, x: number, y: number): boolean {
  const target = demolishTarget(world, x, y);
  if (!target) return false;
  if (target.kind === 'building') return world.removeBuilding(target.id) !== null;
  if (target.kind === 'bridge') return world.removeBridge(x, y) !== null;
  return world.removeBelt(x, y) !== null;
}
