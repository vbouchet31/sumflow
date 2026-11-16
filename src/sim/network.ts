import { DIRS, DX, DY } from '../core/grid';
import { axisOf, type Belt, hasOutput } from './entities';
import { opposite } from '../core/grid';
import type { Target } from './belts';

export interface BeltNetwork {
  /** Node keys (belts and bridge lanes), downstream first (PLAN §6.4). */
  order: number[];
  /** Belt (or lane) of each entry of `order`. */
  belts: Belt[];
  /**
   * What each output leads into, at index `4 × position in order + direction`. Filled on
   * first use: the network is rebuilt after every structural change, so entries stay valid.
   */
  targets: (Target | undefined)[];
  /** Incoming neighbour nodes of each node, in N, E, S, W order (merge sources). */
  inputs: Map<number, number[]>;
}

/** What the network needs from the world. */
export interface NetworkSource {
  nodes(): Iterable<[number, Belt]>;
  laneAt(x: number, y: number, axis: 0 | 1): { belt: Belt; node: number } | null;
}

/**
 * Downstream-first processing order: iterative DFS post-order, starting from nodes in
 * increasing key order. Cycles are broken deterministically: in a pure loop, the smallest
 * key is processed last, i.e. the edge into it is the one cut.
 *
 * Node `t` receives from neighbour `u` if `u` outputs toward `t` and `t` does not output
 * toward `u` (implicit inputs, PLAN §6.4). Bridge lanes are reached along their axis.
 */
export function computeNetwork(src: NetworkSource): BeltNetwork {
  const all = [...src.nodes()].sort((a, b) => a[0] - b[0]);
  const n = all.length;
  // Work on positions in `all`: lookups by (large) node key are the slow part.
  const index = new Map<number, number>();
  for (let i = 0; i < n; i++) index.set((all[i] as [number, Belt])[0], i);
  /** Downstream positions of each node, 4 slots per node (-1 = none). */
  const edges = new Int32Array(n * 4).fill(-1);
  /** Source position of each node by the side it sits on, 4 slots per node (-1 = none). */
  const sides = new Int32Array(n * 4).fill(-1);
  for (let i = 0; i < n; i++) {
    const b = (all[i] as [number, Belt])[1];
    let count = 0;
    for (const d of DIRS) {
      if (!hasOutput(b, d)) continue;
      const target = src.laneAt(b.x + DX[d], b.y + DY[d], axisOf(d));
      if (!target || hasOutput(target.belt, opposite(d))) continue;
      const j = index.get(target.node);
      if (j === undefined) continue;
      edges[i * 4 + count++] = j;
      sides[j * 4 + opposite(d)] = i;
    }
  }

  // Inputs, listed in the N, E, S, W order of the receiving node for a stable round-robin.
  const inputs = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    let ins: number[] | null = null;
    for (let d = 0; d < 4; d++) {
      const u = sides[i * 4 + d] as number;
      if (u >= 0) (ins ??= []).push((all[u] as [number, Belt])[0]);
    }
    if (ins) inputs.set((all[i] as [number, Belt])[0], ins);
  }

  const order: number[] = [];
  const belts: Belt[] = [];
  const seen = new Uint8Array(n);
  /** DFS stack: node positions, and the next edge slot to visit for each. */
  const stack = new Int32Array(n);
  const next = new Uint8Array(n);
  for (let root = 0; root < n; root++) {
    if (seen[root]) continue;
    let top = 0;
    stack[0] = root;
    next[root] = 0;
    seen[root] = 1;
    while (top >= 0) {
      const i = stack[top] as number;
      const slot = next[i] as number;
      const child = slot < 4 ? (edges[i * 4 + slot] as number) : -1;
      if (child >= 0) {
        next[i] = slot + 1;
        if (!seen[child]) {
          seen[child] = 1;
          next[child] = 0;
          stack[++top] = child;
        }
      } else {
        top--;
        const entry = all[i] as [number, Belt];
        order.push(entry[0]);
        belts.push(entry[1]);
      }
    }
  }
  return { order, belts, targets: new Array<Target | undefined>(n * 4), inputs };
}
