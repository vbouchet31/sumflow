import { DIRS, DX, DY, key, opposite } from '../core/grid';
import { axisOf, type Belt, hasOutput, isInputKind, isOutputKind } from './entities';
import type { World } from './world';

/** A belt tile on a traced line, upstream (feeding the start) or downstream of it. */
export interface TracedTile {
  x: number;
  y: number;
  /** -1 upstream, 0 the start, 1 downstream. */
  way: -1 | 0 | 1;
}

export interface FlowTrace {
  tiles: TracedTile[];
  /** Buildings the line comes from (upstream) and goes to (downstream). */
  sources: number[];
  sinks: number[];
}

/** Longest line traced, in belt tiles each way (keeps hovering cheap on huge factories). */
export const TRACE_LIMIT = 4000;

/**
 * Follow the belts joined to the belt (or bridge lanes) at `(x, y)`: downstream through
 * outputs, upstream through whatever feeds them, stopping at buildings. Null when there is
 * no belt there. Read-only.
 */
export function traceFlow(world: World, x: number, y: number): FlowTrace | null {
  const starts: Belt[] = [];
  const belt = world.beltAt(x, y);
  if (belt) starts.push(belt);
  const br = world.bridgeAt(x, y);
  if (br?.h) starts.push(br.h);
  if (br?.v) starts.push(br.v);
  if (starts.length === 0) return null;

  const result: FlowTrace = { tiles: [{ x, y, way: 0 }], sources: [], sinks: [] };
  const sources = new Set<number>();
  const sinks = new Set<number>();
  const seenTiles = new Set<number>([key(x, y)]);
  for (const way of [1, -1] as const) {
    const seen = new Set<Belt>(starts);
    const queue = [...starts];
    let count = 0;
    while (queue.length > 0 && count < TRACE_LIMIT) {
      const b = queue.shift() as Belt;
      for (const d of DIRS) {
        const out = hasOutput(b, d);
        if (way === 1 ? !out : out) continue;
        const nx = b.x + DX[d];
        const ny = b.y + DY[d];
        const lane = world.laneAt(nx, ny, axisOf(d));
        if (lane) {
          // Downstream: the neighbour must not point back; upstream: it must point at us.
          const back = hasOutput(lane.belt, opposite(d));
          if (way === 1 ? back : !back) continue;
          if (seen.has(lane.belt)) continue;
          seen.add(lane.belt);
          queue.push(lane.belt);
          count++;
          const k = key(nx, ny);
          if (!seenTiles.has(k)) {
            seenTiles.add(k);
            result.tiles.push({ x: nx, y: ny, way });
          }
          continue;
        }
        const ref = world.portAt(nx, ny, opposite(d));
        if (!ref) continue;
        const kind = ref.port.kind;
        if (way === 1 && (isInputKind(kind) || kind === 'dynamic')) sinks.add(ref.building.id);
        if (way === -1 && (isOutputKind(kind) || kind === 'dynamic')) sources.add(ref.building.id);
      }
    }
  }
  result.sources = [...sources];
  result.sinks = [...sinks];
  return result;
}
