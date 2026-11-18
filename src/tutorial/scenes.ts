import type { ToolId } from '../build/tools';
import type { PlaceableType } from '../config/balance';
import type { MessageKey } from '../i18n';
import type { Deposit } from '../world/deposits';

/** A tile position. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * One action of the virtual player. Taps and drags go through the real `ToolController`,
 * so the demo shows the same ghosts and builds exactly what a player would.
 */
export type DemoAction =
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'tap'; at: Pt }
  /** Press at `from`, follow the L-shaped belt path to `to`, release. */
  | { kind: 'drag'; from: Pt; to: Pt }
  | { kind: 'wait'; ms: number };

/** A group of actions shown under one caption. */
export interface DemoStep {
  caption: MessageKey;
  params?: Record<string, string | number>;
  actions: DemoAction[];
}

/** Something built before the script starts (the player already knows how). */
export type Prebuilt = { kind: 'extractor'; at: Pt } | { kind: 'belt'; from: Pt; to: Pt };

export interface DemoScene {
  deposits: Deposit[];
  /** Buildings the scene needs unlocked, besides the extractor. */
  unlock: PlaceableType[];
  prebuilt: Prebuilt[];
  steps: DemoStep[];
  /** Value the hub asks for, and that the finished factory delivers. */
  target: number;
  /** Tiles to keep in view (inclusive), hub included. */
  view: { x0: number; y0: number; x1: number; y1: number };
}

export type DemoId =
  'start' | 'adder' | 'multiplier' | 'subtractor' | 'divider' | 'exponent' | 'storage' | 'bridge';

const tool = (t: ToolId): DemoAction => ({ kind: 'tool', tool: t });
const tap = (x: number, y: number): DemoAction => ({ kind: 'tap', at: { x, y } });
const drag = (x1: number, y1: number, x2: number, y2: number): DemoAction => ({
  kind: 'drag',
  from: { x: x1, y: y1 },
  to: { x: x2, y: y2 },
});
const wait = (ms: number): DemoAction => ({ kind: 'wait', ms });
const extractor = (x: number, y: number): Prebuilt => ({ kind: 'extractor', at: { x, y } });

/**
 * Scripted mini factories (PLAN §7.5). The hub covers tiles -3..2 on both axes. Drags end
 * on the tile just before a building: the last belt points into it, and the ghost never
 * shows the red tile a drag onto the building itself would. Every scene is played to its
 * end by a unit test, which checks that the hub receives `target`.
 */
export const DEMOS: Record<DemoId, DemoScene> = {
  // Extractor on a 1, belts to the hub.
  start: {
    deposits: [{ x: 8, y: 0, value: 1 }],
    unlock: [],
    prebuilt: [],
    steps: [
      { caption: 'tut.step.extractor', actions: [tool('extractor'), tap(8, 0)] },
      { caption: 'tut.step.belt', actions: [tool('belt'), drag(6, 0, 3, 0)] },
      { caption: 'tut.step.deliver', actions: [tool('none'), wait(2500)] },
    ],
    target: 1,
    view: { x0: -3, y0: -3, x1: 9, y1: 2 },
  },
  // A from the top, B from the right, the sum leaves from the bottom row.
  adder: {
    deposits: [
      { x: 5, y: -4, value: 1 },
      { x: 10, y: 0, value: 2 },
    ],
    unlock: ['adder'],
    prebuilt: [extractor(5, -4), extractor(10, 0)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('adder'), tap(5, 0)] },
      { caption: 'tut.step.inputs', actions: [tool('belt'), drag(5, -2, 5, -1), drag(8, 0, 7, 0)] },
      { caption: 'tut.step.output', actions: [drag(4, 1, 3, 1)] },
      {
        caption: 'tut.step.formula',
        params: { formula: '1 + 2 = 3' },
        actions: [tool('none'), wait(3000)],
      },
    ],
    target: 3,
    view: { x0: -3, y0: -5, x1: 11, y1: 2 },
  },
  // Inputs at both ends, the product leaves from the middle.
  multiplier: {
    deposits: [
      { x: 5, y: -4, value: 2 },
      { x: 11, y: 0, value: 3 },
    ],
    unlock: ['multiplier'],
    prebuilt: [extractor(5, -4), extractor(11, 0)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('multiplier'), tap(6, 0)] },
      { caption: 'tut.step.inputs', actions: [tool('belt'), drag(5, -2, 5, -1), drag(9, 0, 8, 0)] },
      { caption: 'tut.step.output', actions: [drag(6, 1, 3, 1)] },
      {
        caption: 'tut.step.formula',
        params: { formula: '2 × 3 = 6' },
        actions: [tool('none'), wait(3000)],
      },
    ],
    target: 6,
    view: { x0: -3, y0: -5, x1: 12, y1: 2 },
  },
  // A on top, B at the bottom right: 5 − 2.
  subtractor: {
    deposits: [
      { x: 6, y: -5, value: 5 },
      { x: 11, y: 0, value: 2 },
    ],
    unlock: ['subtractor'],
    prebuilt: [extractor(6, -5), extractor(11, 0)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('subtractor'), tap(6, -1)] },
      {
        caption: 'tut.step.inputs',
        actions: [tool('belt'), drag(6, -3, 6, -2), drag(9, 0, 8, 0)],
      },
      { caption: 'tut.step.output', actions: [drag(5, 0, 3, 0)] },
      {
        caption: 'tut.step.formula',
        params: { formula: '5 − 2 = 3' },
        actions: [tool('none'), wait(3000)],
      },
    ],
    target: 3,
    view: { x0: -3, y0: -6, x1: 12, y1: 2 },
  },
  // 7 ÷ 2: the quotient and the remainder leave from two tiles, onto one belt.
  divider: {
    deposits: [
      { x: 5, y: -4, value: 7 },
      { x: 10, y: 0, value: 2 },
    ],
    unlock: ['divider'],
    prebuilt: [extractor(5, -4), extractor(10, 0)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('divider'), tap(5, 0)] },
      { caption: 'tut.step.inputs', actions: [tool('belt'), drag(5, -2, 5, -1), drag(8, 0, 7, 0)] },
      { caption: 'tut.step.outputs', actions: [drag(6, 2, 3, 2)] },
      { caption: 'tut.step.division', actions: [tool('none'), wait(3000)] },
    ],
    target: 3,
    view: { x0: -3, y0: -5, x1: 11, y1: 2 },
  },
  // On the left of the hub: A from the left, B from the top, the power leaves on the right.
  exponent: {
    deposits: [
      { x: -12, y: 1, value: 2 },
      { x: -7, y: -4, value: 3 },
    ],
    unlock: ['exponent'],
    prebuilt: [extractor(-12, 1), extractor(-7, -4)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('exponent'), tap(-8, 0)] },
      {
        caption: 'tut.step.inputs',
        actions: [tool('belt'), drag(-10, 1, -9, 1), drag(-7, -2, -7, -1)],
      },
      { caption: 'tut.step.output', actions: [drag(-6, 1, -4, 1)] },
      {
        caption: 'tut.step.formula',
        params: { formula: '2³ = 8' },
        actions: [tool('none'), wait(3000)],
      },
    ],
    target: 8,
    view: { x0: -13, y0: -5, x1: 2, y1: 2 },
  },
  // Extractor → storage → hub.
  storage: {
    deposits: [{ x: 12, y: 0, value: 1 }],
    unlock: ['storage'],
    prebuilt: [extractor(12, 0)],
    steps: [
      { caption: 'tut.step.place', actions: [tool('storage'), tap(6, 0)] },
      { caption: 'tut.step.fill', actions: [tool('belt'), drag(10, 0, 8, 0)] },
      { caption: 'tut.step.output', actions: [drag(4, 0, 3, 0)] },
      { caption: 'tut.step.store', actions: [tool('none'), wait(3000)] },
    ],
    target: 1,
    view: { x0: -3, y0: -3, x1: 13, y1: 2 },
  },
  // A belt drawn across another one gets a bridge.
  bridge: {
    deposits: [
      { x: 9, y: 0, value: 1 },
      { x: 5, y: -6, value: 2 },
    ],
    unlock: ['bridge'],
    prebuilt: [
      extractor(9, 0),
      extractor(5, -6),
      { kind: 'belt', from: { x: 7, y: 0 }, to: { x: 2, y: 0 } },
    ],
    steps: [
      { caption: 'tut.step.cross', actions: [tool('belt'), drag(5, -4, 3, 2)] },
      { caption: 'tut.step.bridge', actions: [tool('none'), wait(3500)] },
    ],
    target: 2,
    view: { x0: -3, y0: -7, x1: 10, y1: 2 },
  },
};
