import { DIRS, type Dir, DX, DY, opposite } from '../core/grid';
import { axisOf, type Belt, hasOutput, isInputKind, isOutputKind } from '../sim/entities';
import type { PortRef, World } from '../sim/world';
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
 * Where a belt meets something else, for its chalk rails (see beltChains.ts). Bit d of each
 * mask stands for side d of the belt.
 * - `from`: sides where a building output pushes into the belt;
 * - `into`: output sides that lead into a building input;
 * - `leads`: output sides that lead anywhere at all (a belt, a bridge lane, a building).
 */
export interface BeltLinks {
  from: (b: Belt) => number;
  into: (b: Belt) => number;
  leads: (b: Belt) => number;
}

/** Without a world (bridge lanes, previews): no building around, every output leads on. */
export const NO_BELT_LINKS: BeltLinks = { from: () => 0, into: () => 0, leads: (b) => b.outputs };

/** Read-only view of the world for the belt links. */
export function beltLinks(world: World): BeltLinks {
  const sides = (b: Belt, outputs: boolean, test: (d: Dir) => boolean): number => {
    let mask = 0;
    for (const d of DIRS) if (hasOutput(b, d) === outputs && test(d)) mask |= 1 << d;
    return mask;
  };
  const port = (b: Belt, d: Dir): PortRef | null =>
    world.portAt(b.x + DX[d], b.y + DY[d], opposite(d));
  return {
    from: (b) =>
      sides(b, false, (d) => {
        const kind = port(b, d)?.port.kind;
        return kind !== undefined && (isOutputKind(kind) || kind === 'dynamic');
      }),
    into: (b) =>
      sides(b, true, (d) => {
        const kind = port(b, d)?.port.kind;
        return kind !== undefined && (isInputKind(kind) || kind === 'dynamic');
      }),
    leads: (b) =>
      sides(
        b,
        true,
        (d) => world.laneAt(b.x + DX[d], b.y + DY[d], axisOf(d)) !== null || port(b, d) !== null,
      ),
  };
}
