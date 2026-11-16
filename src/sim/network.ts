import { DIRS, DX, DY } from '../core/grid';
import { axisOf, type Belt, hasOutput } from './entities';
import { opposite } from '../core/grid';

export interface BeltNetwork {
  /** Node keys (belts and bridge lanes), downstream first (PLAN §6.4). */
  order: number[];
  /** Incoming neighbour nodes of each node, in N, E, S, W order (merge sources). */
  inputs: Map<number, number[]>;
}

/** What the network needs from the world. */
export interface NetworkSource {
  nodes(): Iterable<[number, Belt]>;
  laneAt(x: number, y: number, axis: 0 | 1): { belt: Belt; node: number } | null;
}

/**
 * Node `t` receives from neighbour `u` if `u` outputs toward `t` and `t` does not output
 * toward `u` (implicit inputs, PLAN §6.4). Bridge lanes are reached along their axis.
 */
function downstreamOf(src: NetworkSource, b: Belt): number[] {
  const out: number[] = [];
  for (const d of DIRS) {
    if (!hasOutput(b, d)) continue;
    const n = src.laneAt(b.x + DX[d], b.y + DY[d], axisOf(d));
    if (n && !hasOutput(n.belt, opposite(d))) out.push(n.node);
  }
  return out;
}

/**
 * Downstream-first processing order: iterative DFS post-order, starting from nodes in
 * increasing key order. Cycles are broken deterministically: in a pure loop, the smallest
 * key is processed last, i.e. the edge into it is the one cut.
 */
export function computeNetwork(src: NetworkSource): BeltNetwork {
  const all = [...src.nodes()].sort((a, b) => a[0] - b[0]);
  const edges = new Map<number, number[]>();
  for (const [k, b] of all) edges.set(k, downstreamOf(src, b));

  // Inputs, listed in the N, E, S, W order of the receiving node for a stable round-robin.
  const inputs = new Map<number, number[]>();
  const byNode = new Map(all);
  for (const [k, b] of all) {
    const ins: number[] = [];
    for (const d of DIRS) {
      const n = src.laneAt(b.x + DX[d], b.y + DY[d], axisOf(d));
      if (n && edges.get(n.node)?.includes(k)) ins.push(n.node);
    }
    if (ins.length > 0) inputs.set(k, ins);
  }

  const order: number[] = [];
  const seen = new Set<number>();
  for (const [root] of all) {
    if (seen.has(root)) continue;
    const stack: { k: number; i: number }[] = [{ k: root, i: 0 }];
    seen.add(root);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const next = edges.get(top.k) ?? [];
      if (top.i < next.length) {
        const child = next[top.i++];
        if (child !== undefined && !seen.has(child) && byNode.has(child)) {
          seen.add(child);
          stack.push({ k: child, i: 0 });
        }
      } else {
        stack.pop();
        order.push(top.k);
      }
    }
  }
  return { order, inputs };
}
