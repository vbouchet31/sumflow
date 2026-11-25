/**
 * Operations registry (PLAN-objets §2). Every operation a building can perform is declared
 * here once: symbol, ports, pure computation and default upgrade track. The game (cycle logic
 * in `sim/operators.ts`, buffers, rendering, tooltips) and the draw simulator both read it.
 *
 * Adding an operation: one entry in `OPERATIONS` (and its id in `OperationId`), then the
 * building that performs it (`config/buildings.ts`: footprint with matching ports, `op`),
 * its art and its texts.
 */
import { add, divmod, mul, pow, sub } from '../core/intmath';
import type { Track } from './balance';

export type OperationId = 'add' | 'mul' | 'sub' | 'div' | 'pow';

export type InputPort = 'A' | 'B';
export type OutputPort = 'O' | 'Q' | 'R';

/** Values one cycle emits, by output port. An absent port emits nothing this cycle. */
export type OperationResult = Partial<Record<OutputPort, number>>;

export interface OperationDef {
  id: OperationId;
  /** Glyph drawn on the building, its tool icon and the hub reward icon. */
  symbol: string;
  /** Input ports: one item of each is consumed per cycle, `A` is the first operand. */
  inputs: readonly ['A', 'B'];
  /**
   * Output ports, each with its own buffer. A cycle starts only when every one of them has
   * room, even a port the result may leave empty.
   */
  outputs: readonly OutputPort[];
  /**
   * Result of one cycle on `A = a`, `B = b`: pure, saturating 32-bit integers like
   * `core/intmath.ts`. Every key is one of `outputs`; a missing one emits nothing.
   */
  compute: (a: number, b: number) => OperationResult;
  /** `compute(a, b)` equals `compute(b, a)` for every `a`, `b`. */
  commutative: boolean;
  /** Upgrade track setting the speed of the buildings performing it (unless they name one). */
  track: Track;
}

/** The operations, in build bar order of the ordinary operators performing them. */
export const OPERATIONS: Readonly<Record<OperationId, OperationDef>> = {
  add: {
    id: 'add',
    symbol: '+',
    inputs: ['A', 'B'],
    outputs: ['O'],
    compute: (a, b) => ({ O: add(a, b) }),
    commutative: true,
    track: 'adder',
  },
  mul: {
    id: 'mul',
    symbol: '×',
    inputs: ['A', 'B'],
    outputs: ['O'],
    compute: (a, b) => ({ O: mul(a, b) }),
    commutative: true,
    track: 'multiplier',
  },
  sub: {
    id: 'sub',
    symbol: '−',
    inputs: ['A', 'B'],
    outputs: ['O'],
    compute: (a, b) => ({ O: sub(a, b) }),
    commutative: false,
    track: 'subdiv',
  },
  div: {
    id: 'div',
    symbol: '÷',
    inputs: ['A', 'B'],
    outputs: ['Q', 'R'],
    // Truncated quotient and remainder; R is emitted only when non-zero (PLAN §6.3).
    compute: (a, b) => {
      const { q, r } = divmod(a, b);
      return r === 0 ? { Q: q } : { Q: q, R: r };
    },
    commutative: false,
    track: 'subdiv',
  },
  pow: {
    id: 'pow',
    symbol: '^',
    inputs: ['A', 'B'],
    outputs: ['O'],
    compute: (a, b) => ({ O: pow(a, b) }),
    commutative: false,
    track: 'exponent',
  },
};

export const OPERATION_IDS = Object.keys(OPERATIONS) as OperationId[];
