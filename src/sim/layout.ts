import type { World } from './world';

/**
 * Canonical text of the world's layout (buildings with their orientation and priority,
 * belts, bridges, markers), without items. Two layouts are equal iff their strings are.
 * Used by tests and the debug API to check that undo restores the exact state.
 */
export function layoutString(world: World): string {
  const { state } = world;
  const buildings = [...state.buildings.keys()]
    .sort((a, b) => a - b)
    .map((id) => JSON.stringify([id, world.buildingSnap(id)]));
  const tiles = [...state.belts.keys(), ...state.bridges.keys()]
    .sort((a, b) => a - b)
    .map((k) => JSON.stringify([k, world.tileSnap(k)]));
  const markers = [...state.markers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, m]) => JSON.stringify([k, m.text]));
  return [...buildings, '|', ...tiles, '|', ...markers].join('\n');
}
