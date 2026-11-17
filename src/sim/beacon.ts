import { BEACON, TICK_DT } from '../config/balance';
import { type Building, footprintTiles } from './entities';
import type { World } from './world';

/** Is `b` within reach of the beacon at (bx, by)? */
export function inBeaconRange(b: Building, bx: number, by: number): boolean {
  return footprintTiles(b.type, b.x, b.y, b.rot, b.mirror).some(
    (t) => Math.max(Math.abs(t.x - bx), Math.abs(t.y - by)) <= BEACON.radius,
  );
}

/** Feed one item to a beacon. Refused once its glow is full (back-pressure). */
export function fuelBeacon(b: Building): boolean {
  const fuel = b.fuel ?? 0;
  if (fuel + BEACON.secondsPerItem > BEACON.maxSeconds + 1e-9) return false;
  b.fuel = fuel + BEACON.secondsPerItem;
  return true;
}

/**
 * Once per tick, before production: beacons burn their glow, and the ids of the buildings
 * they boost are recomputed (a handful of beacons, each looking at nearby chunks only).
 */
export function stepBeacons(world: World): void {
  const boosted = world.boosted;
  boosted.clear();
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'beacon' || !b.fuel || b.fuel <= 0) continue;
    b.fuel = Math.max(0, b.fuel - TICK_DT);
    const r = BEACON.radius;
    for (const o of world.buildingsInRect(b.x - r, b.y - r, b.x + r, b.y + r)) {
      if (o.type === 'beacon' || o.type === 'hub') continue;
      if (inBeaconRange(o, b.x, b.y)) boosted.add(o.id);
    }
  }
}

/** Speed multiplier of a building from beacons. */
export function beaconFactor(world: World, b: Building): number {
  return world.boosted.has(b.id) ? BEACON.factor : 1;
}
