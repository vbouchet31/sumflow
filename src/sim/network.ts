import { DIRS, DX, DY, key, opposite } from '../core/grid';
import { type Belt, hasOutput } from './entities';

export interface BeltNetwork {
  /** Belt keys, downstream first (PLAN §6.4). */
  order: number[];
  /** Incoming belt neighbours of each belt, in N, E, S, W order (merge sources). */
  inputs: Map<number, number[]>;
}

/**
 * Belt `t` receives from neighbour `u` if `u` outputs toward `t` and `t` does not output
 * toward `u` (implicit inputs, PLAN §6.4).
 */
function downstreamOf(belts: Map<number, Belt>, b: Belt): number[] {
  const out: number[] = [];
  for (const d of DIRS) {
    if (!hasOutput(b, d)) continue;
    const nk = key(b.x + DX[d], b.y + DY[d]);
    const n = belts.get(nk);
    if (n && !hasOutput(n, opposite(d))) out.push(nk);
  }
  return out;
}

/**
 * Downstream-first processing order: iterative DFS post-order, starting from belts in
 * increasing key order. Cycles are broken deterministically: in a pure loop, the smallest
 * key is processed last, i.e. the edge into it is the one cut.
 */
export function computeNetwork(belts: Map<number, Belt>): BeltNetwork {
  const keys = [...belts.keys()].sort((a, b) => a - b);
  const inputs = new Map<number, number[]>();
  const edges = new Map<number, number[]>();
  for (const k of keys) {
    const b = belts.get(k);
    if (!b) continue;
    const down = downstreamOf(belts, b);
    edges.set(k, down);
  }
  // Inputs in N, E, S, W order of the receiving belt, for a stable merge round-robin.
  for (const k of keys) {
    const b = belts.get(k);
    if (!b) continue;
    const ins: number[] = [];
    for (const d of DIRS) {
      const nk = key(b.x + DX[d], b.y + DY[d]);
      if (edges.get(nk)?.includes(k)) ins.push(nk);
    }
    if (ins.length > 0) inputs.set(k, ins);
  }

  const order: number[] = [];
  const state = new Map<number, 1 | 2>(); // 1 = on stack, 2 = done
  for (const root of keys) {
    if (state.has(root)) continue;
    const stack: { k: number; i: number }[] = [{ k: root, i: 0 }];
    state.set(root, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const next = edges.get(top.k) ?? [];
      if (top.i < next.length) {
        const child = next[top.i++];
        if (child !== undefined && !state.has(child)) {
          state.set(child, 1);
          stack.push({ k: child, i: 0 });
        }
      } else {
        stack.pop();
        state.set(top.k, 2);
        order.push(top.k);
      }
    }
  }
  return { order, inputs };
}
