import { type Dir, normalizeRot, type Rot, rotateDir } from '../core/grid';
import type { World } from '../sim/world';
import {
  applyBeltPlan,
  computeLPath,
  type PlannedBelt,
  planBeltPath,
  planSingleBelt,
} from './beltPath';
import {
  applyBuildingPlan,
  type BuildingPlan,
  demolishAt,
  demolishTarget,
  planExtractor,
} from './placement';

export type ToolId = 'none' | 'belt' | 'extractor' | 'demolish';

export interface Modifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/** What the renderer draws as construction ghosts. */
export interface Ghost {
  belts: PlannedBelt[];
  building: BuildingPlan | null;
  demolish: { x: number; y: number } | null;
}

export interface ToolEvents {
  onBuild?: () => void;
  onDemolish?: () => void;
  onError?: () => void;
}

/**
 * Turns pointer and key input (in tile coordinates) into construction actions, and
 * exposes the ghost to draw. No DOM access.
 */
export class ToolController {
  tool: ToolId = 'none';
  rot: Rot = 0;
  private hover: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private ctrl = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly world: World,
    private readonly events: ToolEvents = {},
  ) {}

  /** Subscribe to tool changes (for the build bar). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTool(tool: ToolId): void {
    this.tool = this.tool === tool ? 'none' : tool;
    this.drag = null;
    for (const fn of this.listeners) fn();
  }

  cancel(): void {
    if (this.drag) this.drag = null;
    else this.setTool('none');
  }

  rotate(delta: number): void {
    this.rot = normalizeRot(this.rot + delta);
  }

  /** Belt direction for a single click: East at rotation 0, then clockwise. */
  get beltDir(): Dir {
    return rotateDir(1, this.rot);
  }

  pointerMove(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.drag && (x !== this.drag.x || y !== this.drag.y)) this.drag.moved = true;
  }

  pointerDown(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.tool === 'belt') this.drag = { x, y, moved: false };
  }

  pointerUp(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    switch (this.tool) {
      case 'belt': {
        const plan = this.currentBeltPlan();
        this.drag = null;
        if (plan.length > 0 && applyBeltPlan(this.world, plan) > 0) this.events.onBuild?.();
        else if (plan.every((t) => t.status === 'blocked')) this.events.onError?.();
        break;
      }
      case 'extractor': {
        const plan = planExtractor(this.world, x, y);
        if (applyBuildingPlan(this.world, plan)) this.events.onBuild?.();
        else this.events.onError?.();
        break;
      }
      case 'demolish':
        if (demolishAt(this.world, x, y)) this.events.onDemolish?.();
        break;
      case 'none':
        break;
    }
  }

  /** Quick demolish of the hovered object (Delete key). */
  demolishHovered(): void {
    if (this.hover && demolishAt(this.world, this.hover.x, this.hover.y))
      this.events.onDemolish?.();
  }

  get hovered(): { x: number; y: number } | null {
    return this.hover;
  }

  private currentBeltPlan(): PlannedBelt[] {
    if (!this.hover) return [];
    const d = this.drag;
    if (d?.moved) {
      return planBeltPath(
        this.world,
        computeLPath(d.x, d.y, this.hover.x, this.hover.y, this.ctrl),
      );
    }
    const at = d ?? this.hover;
    return planSingleBelt(this.world, at.x, at.y, this.beltDir);
  }

  ghost(): Ghost {
    const empty: Ghost = { belts: [], building: null, demolish: null };
    if (!this.hover) return empty;
    switch (this.tool) {
      case 'belt':
        return { ...empty, belts: this.currentBeltPlan() };
      case 'extractor':
        return { ...empty, building: planExtractor(this.world, this.hover.x, this.hover.y) };
      case 'demolish':
        return demolishTarget(this.world, this.hover.x, this.hover.y)
          ? { ...empty, demolish: { ...this.hover } }
          : empty;
      case 'none':
        return empty;
    }
  }
}
