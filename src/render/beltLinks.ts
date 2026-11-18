import { DIRS, DX, DY, opposite } from '../core/grid';
import { axisOf, type Belt, hasOutput, isOutputKind } from '../sim/entities';
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
