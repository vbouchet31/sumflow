import { applyBeltPlan, computeLPath, planBeltPath } from '../build/beltPath';
import { applyBuildingPlan, planExtractor } from '../build/placement';
import { ToolController, type ToolId } from '../build/tools';
import { TICK_RATE } from '../config/balance';
import type { MessageKey } from '../i18n';
import { createInitialState } from '../sim/state';
import { runTicks } from '../sim/tick';
import { World } from '../sim/world';
import { DepositMap } from '../world/chunks';
import { type Deposit, depositContains } from '../world/deposits';
import type { DemoAction, DemoScene, Pt } from './scenes';

/** Pointer speed of the virtual player, in tiles per second. */
const MOVE_SPEED = 7;
/** Belt drags are slower, so the ghost can be read as it grows. */
const DRAG_SPEED = 5;
const MIN_MOVE_MS = 250;
const PRESS_MS = 220;
const PAUSE_MS = 350;
const AIM_MS = 250;
/** Upgrade levels of the demo factory: quick results, belts slow enough to follow. */
const DEMO_UPGRADES = { belt: 3, extractor: 2, adder: 8, multiplier: 8, subdiv: 8, exponent: 8 };
/** Simulated time used for the still picture shown when animations are reduced. */
const STILL_SECONDS = 6;

/** Deposits of a scene only: no generated map around them. */
class SceneDeposits extends DepositMap {
  constructor(private readonly list: readonly Deposit[]) {
    super(0);
  }

  override getChunk(): readonly Deposit[] {
    return this.list;
  }

  override depositAt(x: number, y: number): Deposit | null {
    return this.list.find((d) => depositContains(d, x, y)) ?? null;
  }

  override findNearest(value: number): Deposit | null {
    return this.list.find((d) => d.value === value) ?? null;
  }
}

/** A world holding the scene's deposits and prebuilt objects, at time 0. */
export function sceneWorld(scene: DemoScene): World {
  const state = createInitialState(1);
  state.maxExtraction = Math.max(...scene.deposits.map((d) => d.value));
  state.unlockedBuildings.push(...scene.unlock);
  Object.assign(state.upgrades, DEMO_UPGRADES);
  // The hub asks for the scene's result, with a quantity that is never reached.
  state.levelRequirement = { value: scene.target, required: 50, delivered: 0 };
  const world = new World(state, new SceneDeposits(scene.deposits));
  for (const p of scene.prebuilt) {
    if (p.kind === 'extractor') applyBuildingPlan(world, planExtractor(world, p.at.x, p.at.y));
    else
      applyBeltPlan(
        world,
        planBeltPath(world, computeLPath(p.from.x, p.from.y, p.to.x, p.to.y, false)),
      );
  }
  return world;
}

/** One timed piece of the script. `update` receives the progress, 0 to 1. */
interface Segment {
  ms: number;
  start?: () => void;
  update?: (t: number) => void;
  end?: () => void;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Plays a scene (PLAN §7.5): a virtual pointer selects tools, taps and drags through a
 * real `ToolController`, while the simulation runs. No DOM: the view reads `pointer`,
 * `tool`, `caption` and the world after each `advance`.
 */
export class DemoScript {
  readonly world: World;
  readonly tools: ToolController;
  /** Pointer position in tiles (centre of a tile = `x + 0.5`). */
  readonly pointer = { x: 0, y: 0, pressed: false, visible: false };
  caption: { key: MessageKey; params?: Record<string, string | number> } | null = null;
  /** Hub deliveries by value since the start. */
  readonly delivered = new Map<number, number>();
  private readonly segments: Segment[] = [];
  private index = 0;
  private elapsed = 0;
  private started = false;
  private tickCarry = 0;
  /** Where the next move starts from, while the script is being compiled. */
  private cursor: Pt;

  constructor(
    readonly scene: DemoScene,
    /** Touch: the finger only shows ghosts while it is down, as in the game. */
    private readonly touch = false,
  ) {
    this.world = sceneWorld(scene);
    this.tools = new ToolController(this.world);
    this.world.events.on('delivered', ({ value }) => {
      this.delivered.set(value, (this.delivered.get(value) ?? 0) + 1);
    });
    const { view } = scene;
    // The pointer comes in from the bottom right corner of the view.
    this.cursor = { x: view.x1, y: view.y1 };
    this.pointer.x = view.x1 + 0.5;
    this.pointer.y = view.y1 + 0.5;
    for (const step of scene.steps) {
      this.segments.push({
        ms: 0,
        start: () => {
          this.caption = step.params
            ? { key: step.caption, params: step.params }
            : { key: step.caption };
        },
      });
      for (const action of step.actions) this.compile(action);
    }
  }

  get tool(): ToolId {
    return this.tools.tool;
  }

  get done(): boolean {
    return this.index >= this.segments.length;
  }

  /** Total length of the script, in milliseconds. */
  get duration(): number {
    return this.segments.reduce((n, s) => n + s.ms, 0);
  }

  /** Move the script and the simulation forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.tickCarry += (ms * TICK_RATE) / 1000;
    const ticks = Math.floor(this.tickCarry);
    this.tickCarry -= ticks;
    let left = ms;
    while (!this.done) {
      const seg = this.segments[this.index];
      if (!seg) break;
      if (!this.started) {
        this.started = true;
        this.elapsed = 0;
        seg.start?.();
      }
      const room = seg.ms - this.elapsed;
      const used = Math.min(room, left);
      this.elapsed += used;
      left -= used;
      seg.update?.(seg.ms > 0 ? this.elapsed / seg.ms : 1);
      if (this.elapsed < seg.ms) break;
      seg.end?.();
      this.index++;
      this.started = false;
    }
    runTicks(this.world, ticks);
  }

  /** Play everything at once, then let the factory run: the still picture. */
  finish(): void {
    while (!this.done) this.advance(1000);
    this.advance(STILL_SECONDS * 1000);
    this.pointer.visible = false;
  }

  // ---- compilation -------------------------------------------------------

  private compile(action: DemoAction): void {
    const tools = this.tools;
    const mods = { ctrl: false, shift: false, alt: false, touch: this.touch };
    switch (action.kind) {
      case 'tool':
        this.segments.push({
          ms: PAUSE_MS,
          start: () => {
            if (tools.tool !== action.tool) tools.setTool(action.tool);
            if (action.tool === 'none') {
              this.pointer.visible = false;
              tools.clearHover();
            }
          },
        });
        break;
      case 'wait':
        this.segments.push({ ms: action.ms });
        break;
      case 'tap':
        this.moveTo(action.at);
        this.segments.push({
          ms: PRESS_MS,
          start: () => {
            this.pointer.pressed = true;
            tools.pointerMove(action.at.x, action.at.y, mods);
            tools.pointerDown(action.at.x, action.at.y, mods);
          },
          end: () => {
            this.pointer.pressed = false;
            tools.pointerUp(action.at.x, action.at.y, mods);
            tools.clearHover();
          },
        });
        this.segments.push({ ms: PAUSE_MS });
        break;
      case 'drag': {
        const { from, to } = action;
        this.moveTo(from);
        this.segments.push({
          ms: PRESS_MS,
          start: () => {
            this.pointer.pressed = true;
            tools.pointerMove(from.x, from.y, mods);
            tools.pointerDown(from.x, from.y, mods);
          },
        });
        // The pointer follows the very path the belt tool will lay.
        const lpath = computeLPath(from.x, from.y, to.x, to.y, false);
        const path: Pt[] = lpath.length > 0 ? lpath : [from];
        const ms = Math.max(MIN_MOVE_MS, ((path.length - 1) / DRAG_SPEED) * 1000);
        let last = from;
        this.segments.push({
          ms,
          update: (t) => {
            const pos = (path.length - 1) * ease(t);
            const i = Math.min(path.length - 2, Math.floor(pos));
            const a = path[i] ?? from;
            const b = path[i + 1] ?? a;
            const f = pos - i;
            this.pointer.x = a.x + (b.x - a.x) * f + 0.5;
            this.pointer.y = a.y + (b.y - a.y) * f + 0.5;
            const tile = path[Math.round(pos)] ?? a;
            if (tile !== last) {
              last = tile;
              tools.pointerMove(tile.x, tile.y, mods);
            }
          },
        });
        this.segments.push({
          ms: PRESS_MS,
          end: () => {
            this.pointer.pressed = false;
            tools.pointerMove(to.x, to.y, mods);
            tools.pointerUp(to.x, to.y, mods);
            tools.clearHover();
          },
        });
        this.segments.push({ ms: PAUSE_MS });
        this.cursor = to;
        break;
      }
    }
  }

  /** Glide the pointer from where it is to the centre of `to`. */
  private moveTo(to: Pt): void {
    const from = this.cursor;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const mods = { ctrl: false, shift: false, alt: false, touch: this.touch };
    let x0 = 0;
    let y0 = 0;
    this.segments.push({
      ms: Math.max(MIN_MOVE_MS, (dist / MOVE_SPEED) * 1000),
      start: () => {
        this.pointer.visible = true;
        x0 = this.pointer.x;
        y0 = this.pointer.y;
      },
      update: (t) => {
        const e = ease(t);
        this.pointer.x = x0 + (to.x + 0.5 - x0) * e;
        this.pointer.y = y0 + (to.y + 0.5 - y0) * e;
        // A mouse shows the ghost once it rests on the target (on the way, it would flash
        // red over every tile it crosses); a finger above the screen shows none.
        if (t >= 1 && !this.touch) this.tools.pointerMove(to.x, to.y, mods);
      },
    });
    // Aim for a moment before pressing.
    this.segments.push({ ms: AIM_MS });
    this.cursor = to;
  }
}
