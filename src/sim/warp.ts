import { pushOut } from './outputs';
import type { World } from './world';

/**
 * Portals (proposal 07): each entrance hands its waiting items to the exits of its channel,
 * round-robin, at most one try per exit and per tick. An item that finds no free belt next
 * to any exit waits in the entrance, which then refuses new items (back-pressure).
 */
export function stepWarps(world: World): void {
  const exits = world.warpExits();
  for (const b of world.state.buildings.values()) {
    if (b.type !== 'warpIn' || !b.warpBuf?.length || !b.channel) continue;
    const list = exits.get(b.channel);
    if (!list) continue;
    for (let i = 0; i < list.length && b.warpBuf.length > 0; i++) {
      const idx = (b.rrOut + i) % list.length;
      const exit = list[idx];
      const value = b.warpBuf[0];
      if (!exit || value === undefined) continue;
      if (!pushOut(world, exit, 'out', value)) continue;
      b.warpBuf.shift();
      b.rrOut = (idx + 1) % list.length;
    }
  }
}
