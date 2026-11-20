import { DIRS, DX, DY, opposite } from '../core/grid';
import { axisOf, type Belt, hasOutput, isInputKind, isOutputKind } from '../sim/entities';
import type { World } from '../sim/world';
import type { InputsOf } from './layers/belts';

/**
 * Sides that feed each belt, for drawing: a belt or bridge lane pushing into it, or a
 * building output face (storage faces too) against it. Read-only.
 */
export function beltInputs(world: World): InputsOf {
  return (b: Belt) => {
    let mask = 0;
    for (const d of DIRS) {
      if (hasOutput(b, d)) continue;
      const nx = b.x + DX[d];
      const ny = b.y + DY[d];
      const lane = world.laneAt(nx, ny, axisOf(d));
      if (lane) {
        if (hasOutput(lane.belt, opposite(d))) mask |= 1 << d;
        continue;
      }
      const ref = world.portAt(nx, ny, opposite(d));
      if (ref && (isOutputKind(ref.port.kind) || ref.port.kind === 'dynamic')) mask |= 1 << d;
    }
    return mask;
  };
}

/**
 * Draft "tableau noir": sides where a belt meets a building, to draw its doorway. `from`:
 * sides a building output pushes into the belt; `into`: output sides of the belt that lead
 * into a building input.
 */
export interface BuildingLinks {
  from: (b: Belt) => number;
  into: (b: Belt) => number;
}

export const NO_BUILDING_LINKS: BuildingLinks = { from: () => 0, into: () => 0 };

export function buildingLinks(world: World): BuildingLinks {
  return {
    from: (b) => {
      let mask = 0;
      for (const d of DIRS) {
        if (hasOutput(b, d)) continue;
        const ref = world.portAt(b.x + DX[d], b.y + DY[d], opposite(d));
        if (ref && (isOutputKind(ref.port.kind) || ref.port.kind === 'dynamic')) mask |= 1 << d;
      }
      return mask;
    },
    into: (b) => {
      let mask = 0;
      for (const d of DIRS) {
        if (!hasOutput(b, d)) continue;
        const ref = world.portAt(b.x + DX[d], b.y + DY[d], opposite(d));
        if (ref && (isInputKind(ref.port.kind) || ref.port.kind === 'dynamic')) mask |= 1 << d;
      }
      return mask;
    },
  };
}
