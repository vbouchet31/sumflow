import { type Dir, normalizeRot, type Rot, rotateDir } from '../core/grid';
import { type FreeBuildingType, isFreeBuilding } from '../sim/entities';
import { togglePriorityAt } from '../sim/priority';
import { isBuildingUnlocked, isFeatureUnlocked } from '../sim/state';
import type { World } from '../sim/world';
import {
  applyBeltPlan,
  computeLPath,
  type PlannedBelt,
  planBeltPath,
  planManualBridge,
  planSingleBelt,
} from './beltPath';
import {
  applyBuildingPlan,
  type BuildingPlan,
  demolishAt,
  demolishTarget,
  planExtractor,
  planOperatorRow,
} from './placement';

export type ToolId =
  'none' | 'belt' | 'extractor' | 'demolish' | 'bridge' | 'priority' | FreeBuildingType;

export interface Modifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/** What the renderer draws as construction ghosts. */
export interface Ghost {
  belts: PlannedBelt[];
  buildings: BuildingPlan[];
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

  /** Select a tool (selecting the active one again deselects it). Locked tools are ignored. */
  setTool(tool: ToolId): void {
    if (!this.isAvailable(tool)) return;
    this.tool = this.tool === tool ? 'none' : tool;
    this.drag = null;
    for (const fn of this.listeners) fn();
  }

  /** Locked buildings and features cannot be selected. */
  isAvailable(tool: ToolId): boolean {
    const { state } = this.world;
    if (isFreeBuilding(tool) || tool === 'bridge') return isBuildingUnlocked(state, tool);
    if (tool === 'priority') return isFeatureUnlocked(state, 'priorities');
    return true;
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
    if (this.tool === 'belt' && mods.alt) return; // Alt+click = priority (on release)
    if (this.tool === 'belt' || isFreeBuilding(this.tool)) this.drag = { x, y, moved: false };
  }

  pointerUp(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    const tool = this.tool;
    if (tool === 'priority' || (tool === 'belt' && mods.alt && !this.drag)) {
      if (togglePriorityAt(this.world, x, y) !== 'none') this.events.onBuild?.();
      else this.events.onError?.();
      return;
    }
    if (tool === 'bridge') {
      const plan = planManualBridge(this.world, x, y, this.beltDir);
      if (plan) {
        this.world.setBridge(x, y, plan.h, plan.v);
        this.events.onBuild?.();
      } else this.events.onError?.();
      return;
    }
    if (tool === 'belt') {
      const plan = this.currentBeltPlan();
      this.drag = null;
      if (plan.length > 0 && applyBeltPlan(this.world, plan) > 0) this.events.onBuild?.();
      else if (plan.every((t) => t.status === 'blocked')) this.events.onError?.();
    } else if (tool === 'extractor') {
      if (applyBuildingPlan(this.world, planExtractor(this.world, x, y))) this.events.onBuild?.();
      else this.events.onError?.();
    } else if (tool === 'demolish') {
      if (demolishAt(this.world, x, y)) this.events.onDemolish?.();
    } else if (isFreeBuilding(tool)) {
      const plans = this.currentOperatorPlans(tool);
      this.drag = null;
      let placed = 0;
      for (const p of plans) {
        // Re-check: an earlier copy of the row may now occupy the spot.
        if (p.ok && this.world.isFootprintFree(p.type, p.x, p.y, p.rot)) {
          if (applyBuildingPlan(this.world, p)) placed++;
        }
      }
      if (placed > 0) this.events.onBuild?.();
      else this.events.onError?.();
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

  private currentOperatorPlans(type: FreeBuildingType): BuildingPlan[] {
    if (!this.hover) return [];
    const from = this.drag ?? this.hover;
    const to = this.drag?.moved ? this.hover : from;
    return planOperatorRow(this.world, type, from, to, this.rot);
  }

  ghost(): Ghost {
    const empty: Ghost = { belts: [], buildings: [], demolish: null };
    if (!this.hover) return empty;
    const tool = this.tool;
    if (tool === 'belt') return { ...empty, belts: this.currentBeltPlan() };
    if (tool === 'extractor') {
      return { ...empty, buildings: [planExtractor(this.world, this.hover.x, this.hover.y)] };
    }
    if (tool === 'demolish') {
      return demolishTarget(this.world, this.hover.x, this.hover.y)
        ? { ...empty, demolish: { ...this.hover } }
        : empty;
    }
    if (isFreeBuilding(tool)) return { ...empty, buildings: this.currentOperatorPlans(tool) };
    if (tool === 'bridge') {
      const { x, y } = this.hover;
      const plan = planManualBridge(this.world, x, y, this.beltDir);
      return {
        ...empty,
        belts: [
          { x, y, dir: plan?.h ?? this.beltDir, status: plan ? 'bridge' : 'blocked', outputs: 0 },
        ],
      };
    }
    return empty;
  }
}
