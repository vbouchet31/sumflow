import { type Dir, key, normalizeRot, type Rot, rotateDir } from '../core/grid';
import type { Clip } from '../sim/clip';
import { type FreeBuildingType, isFreeBuilding } from '../sim/entities';
import { togglePriorityAt } from '../sim/priority';
import { isBuildingUnlocked, isFeatureUnlocked } from '../sim/state';
import { singleOutput, type World } from '../sim/world';
import { clearArea, demolishArea, type Rect, rectSize, selectionRect } from './area';
import {
  applyBeltPlan,
  computeLPath,
  type PlannedBelt,
  planBeltPath,
  planManualBridge,
  planSingleBelt,
} from './beltPath';
import {
  applyPaste,
  copyArea,
  type PastePlan,
  planPasteRow,
  pushClip,
  transformClip,
} from './clipboard';
import { History } from './history';
import {
  applyBuildingPlan,
  type BuildingPlan,
  demolishAt,
  demolishTarget,
  planExtractor,
  planOperatorRow,
} from './placement';

/** Zone tools: drag a rectangle (PLAN §8.2). */
export type AreaTool = 'demolish' | 'clear' | 'copy' | 'cut';

export type ToolId =
  | 'none'
  | 'belt'
  | 'extractor'
  | 'bridge'
  | 'priority'
  | 'paste'
  | 'marker'
  | AreaTool
  | FreeBuildingType;

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
  /** Selection rectangle of a zone tool while dragging. */
  area: { rect: Rect; kind: AreaTool } | null;
}

export interface ToolEvents {
  onBuild?: () => void;
  onDemolish?: () => void;
  onError?: () => void;
  /** Items removed by the clear tool. */
  onClear?: (items: number) => void;
  /** A marker tile was clicked: open the editor (existing text or null). */
  onMarker?: (x: number, y: number, text: string | null) => void;
}

function isAreaTool(tool: ToolId): tool is AreaTool {
  return tool === 'demolish' || tool === 'clear' || tool === 'copy' || tool === 'cut';
}

/**
 * Turns pointer and key input (in tile coordinates) into construction and editing actions,
 * and exposes the ghost to draw. Every change to the layout runs inside `history`, so it
 * can be undone (PLAN §8.2). No DOM access.
 */
export class ToolController {
  tool: ToolId = 'none';
  rot: Rot = 0;
  readonly history: History;
  /** Selected clipboard entry and its paste transform. */
  clipIndex = 0;
  pasteRot: Rot = 0;
  pasteMirror = false;
  private hover: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private ctrl = false;
  private listeners = new Set<() => void>();
  private clipCache: { src: Clip; rot: Rot; mirror: boolean; clip: Clip } | null = null;

  constructor(
    private readonly world: World,
    private readonly events: ToolEvents = {},
    history?: History,
  ) {
    this.history = history ?? new History(world);
  }

  /** Subscribe to tool changes (for the build bar). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Select a tool (selecting the active one again deselects it). Locked tools are ignored. */
  setTool(tool: ToolId): void {
    if (!this.isAvailable(tool)) return;
    this.tool = this.tool === tool ? 'none' : tool;
    this.drag = null;
    this.notify();
  }

  /** Select a tool without toggling. */
  private forceTool(tool: ToolId): void {
    this.tool = tool;
    this.drag = null;
    this.notify();
  }

  /** Locked buildings and features cannot be selected; paste needs a clipboard entry. */
  isAvailable(tool: ToolId): boolean {
    const { state } = this.world;
    if (isFreeBuilding(tool) || tool === 'bridge') return isBuildingUnlocked(state, tool);
    if (tool === 'priority') return isFeatureUnlocked(state, 'priorities');
    if (tool === 'paste') return state.clipboard.length > 0;
    return true;
  }

  cancel(): void {
    if (this.drag) this.drag = null;
    else this.setTool('none');
  }

  /** `R` / `Shift+R`: rotates the ghost, or the paste preview in paste mode. */
  rotate(delta: number): void {
    if (this.tool === 'paste') this.pasteRot = normalizeRot(this.pasteRot + delta);
    else this.rot = normalizeRot(this.rot + delta);
  }

  /**
   * `F` in paste mode: mirror the preview horizontally as it is shown. With the transform
   * stored as "mirror, then rotate by r", mirroring the result gives "mirror, then −r".
   */
  mirror(): void {
    if (this.tool !== 'paste') return;
    this.pasteMirror = !this.pasteMirror;
    this.pasteRot = normalizeRot(-this.pasteRot);
  }

  /** Belt direction for a single click: East at rotation 0, then clockwise. */
  get beltDir(): Dir {
    return rotateDir(1, this.rot);
  }

  // ---- clipboard ---------------------------------------------------------

  /** `Shift+wheel` in paste mode: move through the clipboard history. */
  cycleClip(delta: number): void {
    const n = this.world.state.clipboard.length;
    if (n === 0) return;
    this.clipIndex = (((this.clipIndex + delta) % n) + n) % n;
    this.pasteRot = 0;
    this.pasteMirror = false;
  }

  /** Remove the selected clipboard entry (`Delete` in paste mode). */
  removeClip(): void {
    const list = this.world.state.clipboard;
    if (list.length === 0) return;
    list.splice(this.clipIndex, 1);
    this.clipIndex = Math.min(this.clipIndex, Math.max(0, list.length - 1));
    if (list.length === 0) this.forceTool('none');
    else this.notify();
  }

  get clipboardSize(): number {
    return this.world.state.clipboard.length;
  }

  /** The selected clip with the current rotation and mirror, or null. */
  currentClip(): Clip | null {
    const src = this.world.state.clipboard[this.clipIndex];
    if (!src) return null;
    const c = this.clipCache;
    if (c && c.src === src && c.rot === this.pasteRot && c.mirror === this.pasteMirror) {
      return c.clip;
    }
    const clip = transformClip(src, this.pasteRot, this.pasteMirror);
    this.clipCache = { src, rot: this.pasteRot, mirror: this.pasteMirror, clip };
    return clip;
  }

  /** Copy (or cut) a zone into the clipboard, then switch to paste mode. */
  copyRect(rect: Rect, cut: boolean): boolean {
    const clip = copyArea(this.world, rect);
    if (!clip) return false;
    pushClip(this.world.state.clipboard, clip);
    this.clipIndex = 0;
    this.pasteRot = 0;
    this.pasteMirror = false;
    if (cut) this.history.run(() => demolishArea(this.world, rect));
    this.forceTool('paste');
    return true;
  }

  // ---- pointer -----------------------------------------------------------

  pointerMove(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.drag && (x !== this.drag.x || y !== this.drag.y)) this.drag.moved = true;
  }

  pointerDown(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.tool === 'belt' && mods.alt) return; // Alt+click = priority (on release)
    const t = this.tool;
    if (t === 'belt' || t === 'paste' || isAreaTool(t) || isFreeBuilding(t)) {
      this.drag = { x, y, moved: false };
    }
  }

  pointerUp(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    const tool = this.tool;
    const drag = this.drag;
    this.drag = null;
    const run = <T>(fn: () => T): T => this.history.run(fn);
    if (tool === 'none' || tool === 'marker') {
      const marker = this.world.state.markers.get(key(x, y));
      if (marker || tool === 'marker') this.events.onMarker?.(x, y, marker?.text ?? null);
      return;
    }
    if (tool === 'priority' || (tool === 'belt' && mods.alt && !drag)) {
      if (run(() => togglePriorityAt(this.world, x, y)) !== 'none') this.events.onBuild?.();
      else this.events.onError?.();
      return;
    }
    if (tool === 'bridge') {
      const plan = planManualBridge(this.world, x, y, this.beltDir);
      if (plan) {
        run(() => this.world.setBridge(x, y, plan.h, plan.v));
        this.events.onBuild?.();
      } else this.events.onError?.();
      return;
    }
    if (tool === 'belt') {
      const plan = this.beltPlan(drag);
      if (plan.length > 0 && run(() => applyBeltPlan(this.world, plan)) > 0)
        this.events.onBuild?.();
      else if (plan.every((t) => t.status === 'blocked')) this.events.onError?.();
      return;
    }
    if (tool === 'extractor') {
      if (run(() => applyBuildingPlan(this.world, planExtractor(this.world, x, y))))
        this.events.onBuild?.();
      else this.events.onError?.();
      return;
    }
    if (isAreaTool(tool)) {
      this.applyArea(tool, drag);
      return;
    }
    if (tool === 'paste') {
      const placed = run(() =>
        this.pastePlans(drag).reduce((n, p) => n + applyPaste(this.world, p), 0),
      );
      if (placed > 0) this.events.onBuild?.();
      else this.events.onError?.();
      return;
    }
    if (isFreeBuilding(tool)) {
      const plans = this.operatorPlans(tool, drag);
      const placed = run(() => {
        let n = 0;
        for (const p of plans) {
          // Re-check: an earlier copy of the row may now occupy the spot.
          if (p.ok && this.world.isFootprintFree(p.type, p.x, p.y, p.rot)) {
            if (applyBuildingPlan(this.world, p)) n++;
          }
        }
        return n;
      });
      if (placed > 0) this.events.onBuild?.();
      else this.events.onError?.();
    }
  }

  private applyArea(tool: AreaTool, drag: { x: number; y: number; moved: boolean } | null): void {
    if (!this.hover) return;
    const rect = selectionRect(drag ?? this.hover, this.hover);
    if (tool === 'demolish') {
      // A simple click demolishes one object; a drag, the whole zone.
      const n = drag?.moved
        ? this.history.run(() => demolishArea(this.world, rect))
        : this.history.run(() =>
            demolishAt(this.world, this.hover?.x ?? 0, this.hover?.y ?? 0) ? 1 : 0,
          );
      if (n > 0) this.events.onDemolish?.();
    } else if (tool === 'clear') {
      this.events.onClear?.(clearArea(this.world, rect));
    } else if (this.copyRect(rect, tool === 'cut')) {
      if (tool === 'cut') this.events.onDemolish?.();
      else this.events.onBuild?.();
    } else {
      this.events.onError?.();
    }
  }

  /** `Delete`: removes the clipboard entry in paste mode, else the hovered object. */
  deletePressed(): void {
    if (this.tool === 'paste') {
      this.removeClip();
      return;
    }
    const h = this.hover;
    if (h && this.history.run(() => demolishAt(this.world, h.x, h.y))) this.events.onDemolish?.();
  }

  /** `E`: pick the hovered object's tool and orientation (PLAN §8.2). */
  pick(): void {
    const h = this.hover;
    if (!h) return;
    const b = this.world.buildingAt(h.x, h.y);
    if (b && b.type !== 'hub') {
      if (!this.isAvailable(b.type)) return;
      this.rot = b.rot;
      this.forceTool(b.type);
      return;
    }
    if (this.world.bridgeAt(h.x, h.y) && this.isAvailable('bridge')) {
      this.forceTool('bridge');
      return;
    }
    const belt = this.world.beltAt(h.x, h.y);
    if (belt) {
      const d = singleOutput(belt);
      if (d !== null) this.rot = normalizeRot(d - 1); // beltDir = rot + 1 (East at 0)
      this.forceTool('belt');
    }
  }

  /** Create, edit or delete (empty text) a marker, as one undoable action. */
  setMarker(x: number, y: number, text: string): void {
    this.history.run(() => this.world.setMarker(x, y, text.trim() === '' ? null : text.trim()));
  }

  undo(): boolean {
    this.drag = null;
    return this.history.undo();
  }

  redo(): boolean {
    this.drag = null;
    return this.history.redo();
  }

  get hovered(): { x: number; y: number } | null {
    return this.hover;
  }

  /** Size of the zone being dragged, for the hint. */
  get dragArea(): { w: number; h: number } | null {
    if (!this.drag?.moved || !this.hover || !isAreaTool(this.tool)) return null;
    return rectSize(selectionRect(this.drag, this.hover));
  }

  private beltPlan(drag: { x: number; y: number; moved: boolean } | null): PlannedBelt[] {
    if (!this.hover) return [];
    if (drag?.moved) {
      return planBeltPath(
        this.world,
        computeLPath(drag.x, drag.y, this.hover.x, this.hover.y, this.ctrl),
      );
    }
    const at = drag ?? this.hover;
    return planSingleBelt(this.world, at.x, at.y, this.beltDir);
  }

  private operatorPlans(
    type: FreeBuildingType,
    drag: { x: number; y: number; moved: boolean } | null,
  ): BuildingPlan[] {
    if (!this.hover) return [];
    const from = drag ?? this.hover;
    const to = drag?.moved ? this.hover : from;
    return planOperatorRow(this.world, type, from, to, this.rot);
  }

  private pastePlans(drag: { x: number; y: number; moved: boolean } | null): PastePlan[] {
    const clip = this.currentClip();
    if (!clip || !this.hover) return [];
    const from = drag ?? this.hover;
    const to = drag?.moved ? this.hover : from;
    return planPasteRow(this.world, clip, from, to);
  }

  ghost(): Ghost {
    const empty: Ghost = { belts: [], buildings: [], demolish: null, area: null };
    if (!this.hover) return empty;
    const tool = this.tool;
    const drag = this.drag;
    if (tool === 'belt') return { ...empty, belts: this.beltPlan(drag) };
    if (tool === 'extractor') {
      return { ...empty, buildings: [planExtractor(this.world, this.hover.x, this.hover.y)] };
    }
    if (isAreaTool(tool)) {
      if (drag?.moved)
        return { ...empty, area: { rect: selectionRect(drag, this.hover), kind: tool } };
      if (tool === 'demolish') {
        return demolishTarget(this.world, this.hover.x, this.hover.y)
          ? { ...empty, demolish: { ...this.hover } }
          : empty;
      }
      return { ...empty, area: { rect: selectionRect(this.hover, this.hover), kind: tool } };
    }
    if (tool === 'paste') return pasteGhost(this.pastePlans(drag));
    if (isFreeBuilding(tool)) return { ...empty, buildings: this.operatorPlans(tool, drag) };
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

function firstDir(mask: number): Dir {
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) return d as Dir;
  return 1;
}

/** Paste preview drawn with the regular ghost layers. */
function pasteGhost(plans: PastePlan[]): Ghost {
  const ghost: Ghost = { belts: [], buildings: [], demolish: null, area: null };
  for (const p of plans) {
    for (const b of p.buildings) {
      ghost.buildings.push({
        type: b.type,
        x: b.x,
        y: b.y,
        rot: b.rot,
        mirror: b.mirror,
        ok: b.ok,
      });
    }
    for (const b of p.belts) {
      ghost.belts.push({
        x: b.x,
        y: b.y,
        dir: firstDir(b.outputs),
        outputs: b.outputs,
        status: b.status,
      });
    }
    for (const b of p.bridges) {
      ghost.belts.push({
        x: b.x,
        y: b.y,
        dir: b.h ?? b.v ?? 1,
        outputs: 0,
        status: b.status === 'blocked' ? 'blocked' : 'bridge',
      });
    }
  }
  return ghost;
}
