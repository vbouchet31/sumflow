import type { SpecialEdition } from '../config/cards';
import { type Dir, key, normalizeRot, type Rot, rotateDir } from '../core/grid';
import type { Clip } from '../sim/clip';
import {
  type Building,
  buildingSize,
  type FreeBuildingType,
  isFreeBuilding,
} from '../sim/entities';
import {
  applyEdition,
  canRemoveEdition,
  type EditionCheck,
  editionCheck,
  freeEditionCards,
  hasEditionCards,
  removeEdition,
} from '../sim/inventory';
import { togglePriorityAt } from '../sim/priority';
import { isBuildingUnlocked, isFeatureUnlocked } from '../sim/state';
import { singleOutput, type World } from '../sim/world';
import { clearArea, demolishArea, type Rect, rectSize, selectionRect } from './area';
import {
  applyBeltPlan,
  type Cell,
  computeLPath,
  extendTrail,
  type PlannedBelt,
  planBeltPath,
  trailToPath,
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
import { NOTHING_TOUCHED } from './touched';
import type { Touched } from './touched';
import { applyMove, isMovable, isRotatable, type MovePlan, planMove, rotatedOrigin } from './move';
import {
  applyBuildingPlan,
  type BuildingPlan,
  demolishAt,
  demolishTarget,
  planExtractor,
  planOperatorRow,
} from './placement';

/** A press being dragged: start tile, and the tiles crossed for a freehand belt. */
interface Drag {
  x: number;
  y: number;
  moved: boolean;
  trail?: Cell[];
}

/**
 * Zone tools: drag a rectangle (PLAN §8.2). `select` keeps the zone selected, for the
 * copy and cut actions of the selection tray.
 */
export type AreaTool = 'demolish' | 'clear' | 'copy' | 'cut' | 'select';

export type ToolId =
  | 'none'
  | 'belt'
  | 'extractor'
  | 'bridge'
  | 'priority'
  | 'paste'
  | 'marker'
  | 'edition'
  | AreaTool
  | FreeBuildingType;

export interface Modifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** The press comes from a finger: pasting waits for a confirmation (`confirmPaste`). */
  touch?: boolean;
}

/** What the renderer draws as construction ghosts. */
export interface Ghost {
  belts: PlannedBelt[];
  buildings: BuildingPlan[];
  demolish: { x: number; y: number } | null;
  /** Selection rectangle of a zone tool while dragging. */
  area: { rect: Rect; kind: AreaTool } | null;
  /** Tiles drawn faded: a building being moved, at its old place, and belts it drops. */
  fade?: Rect[];
  /** Belts that stay while a building moves, tinted by line (see `PlannedBelt.line`). */
  tints?: { x: number; y: number; line: number }[];
  /** Edition tool: the hovered building as it would look with the edition (a copy). */
  preview?: Building;
}

/** A building being dragged to a new place (no tool). */
interface Moving {
  id: number;
  /** Tile grabbed, and the rotation of the ghost (R while dragging). */
  grabX: number;
  grabY: number;
  rot: Rot;
  moved: boolean;
}

/**
 * What the controller reports. Build and demolish events carry what the action did to the
 * layout (for the chalk effects); a zone demolition, a cut and a clear carry their zone.
 */
export interface ToolEvents {
  onBuild?: (touched: Touched) => void;
  onDemolish?: (touched: Touched) => void;
  onError?: () => void;
  /** Items removed by the clear tool, in the zone swept. */
  onClear?: (items: number, area: Rect) => void;
  /** Undo or redo changed the layout. */
  onRestore?: (touched: Touched) => void;
  /** A marker tile was clicked: open the editor (existing text or null). */
  onMarker?: (x: number, y: number, text: string | null) => void;
}

/**
 * Object selected without a tool (tap or click): a building, by id so that it follows the
 * building when it moves, or a tile (belt, bridge, deposit). It stays until the player
 * clicks elsewhere, presses Escape or picks a tool.
 */
export type Selection = { kind: 'building'; id: number } | { kind: 'tile'; x: number; y: number };

function isAreaTool(tool: ToolId): tool is AreaTool {
  return (
    tool === 'demolish' ||
    tool === 'clear' ||
    tool === 'copy' ||
    tool === 'cut' ||
    tool === 'select'
  );
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
  /**
   * Belt drags start along the other axis. Toggled by a button (touch); holding Ctrl
   * inverts it for the time of the drag.
   */
  elbowSwap = false;
  /** Belt drag: L-shaped path (`l`) or along the tiles the pointer went through (`free`). */
  beltMode: 'l' | 'free' = 'l';
  /** Edition tool: the variant applied by a click. */
  private variant: SpecialEdition = 'brillante';
  private hover: { x: number; y: number } | null = null;
  private selected: Selection | null = null;
  /** Zone selected with the `select` tool (kept until a new drag, a click or another tool). */
  private zone: Rect | null = null;
  private moving: Moving | null = null;
  private moveCache: { at: string; plan: MovePlan | null } | null = null;
  /**
   * Touch: tile where the paste preview was put down. It stays there once the finger is
   * up, until `confirmPaste` (a finger hides what is under it, and a paste is large).
   */
  private pending: { x: number; y: number } | null = null;
  private pendingBefore: { x: number; y: number } | null = null;
  /** A finger is moving the paste preview. */
  private touchPaste = false;
  private drag: Drag | null = null;
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

  /** Report a build: what the action just run in `history` placed. */
  private built(touched: Touched = this.history.lastTouched()): void {
    this.events.onBuild?.(touched);
  }

  /** Report a demolition: what the action just run removed, and the zone swept, if any. */
  private demolished(area: Rect | null = null): void {
    const touched = this.history.lastTouched();
    this.events.onDemolish?.(area ? { ...touched, area } : touched);
  }

  /** Select a tool (selecting the active one again deselects it). Locked tools are ignored. */
  setTool(tool: ToolId): void {
    if (!this.isAvailable(tool)) return;
    this.tool = this.tool === tool ? 'none' : tool;
    if (this.tool === 'edition') this.variant = this.preferredVariant();
    this.drag = null;
    this.moving = null;
    this.selected = null;
    this.zone = null;
    this.dropPending();
    this.notify();
  }

  /** Select a tool without toggling. */
  private forceTool(tool: ToolId): void {
    this.tool = tool;
    this.drag = null;
    this.moving = null;
    this.selected = null;
    this.zone = null;
    this.dropPending();
    this.notify();
  }

  private dropPending(): void {
    this.pending = null;
    this.pendingBefore = null;
    this.touchPaste = false;
  }

  /** Locked buildings and features cannot be selected; paste needs a clipboard entry. */
  isAvailable(tool: ToolId): boolean {
    const { state } = this.world;
    if (isFreeBuilding(tool) || tool === 'bridge') return isBuildingUnlocked(state, tool);
    if (tool === 'priority') return isFeatureUnlocked(state, 'priorities');
    if (tool === 'paste') return state.clipboard.length > 0;
    if (tool === 'edition') return hasEditionCards(state);
    return true;
  }

  // ---- editions ------------------------------------------------------------

  /** Variant of the Edition tool (brillante or légendaire). */
  get editionVariant(): SpecialEdition {
    return this.variant;
  }

  setEditionVariant(edition: SpecialEdition): void {
    if (this.variant === edition) return;
    this.variant = edition;
    this.notify();
  }

  /** Free edition cards of `edition` (the counters of the tool and the bubble). */
  freeEditions(edition: SpecialEdition): number {
    return freeEditionCards(this.world.state, edition);
  }

  /** At least one card of `edition` was obtained (its variant is shown). */
  ownsEdition(edition: SpecialEdition): boolean {
    return this.world.state.editionCards[edition] > 0;
  }

  /** The current variant, unless it has no free card left and the other one has. */
  private preferredVariant(): SpecialEdition {
    const other = otherEdition(this.variant);
    const usable = (e: SpecialEdition): boolean => this.freeEditions(e) > 0;
    if (!usable(this.variant) && usable(other)) return other;
    if (!this.ownsEdition(this.variant) && this.ownsEdition(other)) return other;
    return this.variant;
  }

  /**
   * `G`: select the Edition tool; pressed again, switch to the other variant when it was
   * ever obtained, else put the tool down. False when no edition card was ever obtained.
   */
  editionKey(): boolean {
    if (!this.isAvailable('edition')) return false;
    if (this.tool !== 'edition') {
      this.setTool('edition');
      return true;
    }
    const other = otherEdition(this.variant);
    if (this.ownsEdition(other)) this.setEditionVariant(other);
    else this.setTool('none');
    return true;
  }

  /** What a click of the Edition tool would do on the building `b`. */
  editionCheck(b: Building, edition: SpecialEdition = this.variant): EditionCheck {
    return editionCheck(this.world.state, b, edition);
  }

  /** Apply `edition` on `b` as one undoable action, with its sound and chalk dust. */
  private applyEditionOn(b: Building, edition: SpecialEdition): boolean {
    if (this.history.run(() => applyEdition(this.world, b, edition))) {
      this.built();
      return true;
    }
    this.events.onError?.();
    return false;
  }

  /** The selected building can take `edition` (applied, or swapped with its own). */
  canEditionSelection(edition: SpecialEdition): boolean {
    const b = this.tool === 'none' ? this.selectedBuilding : null;
    if (!b) return false;
    const check = this.editionCheck(b, edition);
    return check === 'apply' || check === 'swap';
  }

  /** Apply `edition` on the selected building (selection bubble). */
  editionSelection(edition: SpecialEdition): boolean {
    const b = this.selectedBuilding;
    return b !== null && this.applyEditionOn(b, edition);
  }

  /** The selected building has an applied edition that can be taken back. */
  get canRemoveSelectionEdition(): boolean {
    const b = this.tool === 'none' ? this.selectedBuilding : null;
    return b !== null && canRemoveEdition(this.world, b);
  }

  /** "Remove the edition": the card goes back to the player, the building to base. */
  removeSelectionEdition(): boolean {
    const b = this.selectedBuilding;
    if (b && this.history.run(() => removeEdition(this.world, b))) {
      this.built();
      return true;
    }
    this.events.onError?.();
    return false;
  }

  cancel(): void {
    if (this.moving) this.moving = null;
    else if (this.drag) this.drag = null;
    else if (this.tool === 'none') this.clearSelection();
    else if (this.zone) this.clearZone();
    else this.setTool('none');
  }

  /**
   * `R` / `Shift+R`: rotates the ghost, or the paste preview in paste mode. Without a tool,
   * the building being moved, else the selected building (in place, with its belts).
   */
  rotate(delta: number): void {
    if (this.tool === 'none') {
      const b = this.selectedBuilding;
      if (this.moving) {
        this.moving.rot = normalizeRot(this.moving.rot + delta);
      } else if (b && isRotatable(b)) {
        const to = rotatedOrigin(b, delta);
        const plan = planMove(this.world, b.id, to.x, to.y, to.rot);
        if (plan && this.history.run(() => applyMove(this.world, plan))) this.built();
        else this.events.onError?.();
      }
      return;
    }
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

  /** Whether rotating changes what the current tool builds. */
  get canRotate(): boolean {
    const t = this.tool;
    if (t === 'none') {
      const b = this.selectedBuilding;
      return b !== null && isRotatable(b);
    }
    return (
      t === 'belt' || t === 'bridge' || t === 'paste' || (isFreeBuilding(t) && t !== 'storage')
    );
  }

  toggleElbow(): void {
    this.elbowSwap = !this.elbowSwap;
  }

  /** Belt direction for a single click: East at rotation 0, then clockwise. */
  get beltDir(): Dir {
    return rotateDir(1, this.rot);
  }

  // ---- selection ---------------------------------------------------------

  /** The selection, or null once its object is gone (demolished, undone). */
  get selection(): Selection | null {
    const s = this.selected;
    if (!s) return null;
    const alive =
      s.kind === 'building'
        ? this.world.state.buildings.has(s.id)
        : selectableTile(this.world, s.x, s.y);
    if (!alive) this.selected = null;
    return this.selected;
  }

  /** The selected building, if the selection is one. */
  get selectedBuilding(): Building | null {
    const s = this.selection;
    return s?.kind === 'building' ? (this.world.state.buildings.get(s.id) ?? null) : null;
  }

  /** A tile of the selected object (for the tooltip and the pipette). */
  get selectionTile(): { x: number; y: number } | null {
    const s = this.selection;
    if (!s) return null;
    if (s.kind === 'tile') return { x: s.x, y: s.y };
    const b = this.selectedBuilding;
    return b ? { x: b.x, y: b.y } : null;
  }

  /** Tiles to outline around the selection. */
  get selectionRect(): Rect | null {
    const s = this.selection;
    if (!s) return null;
    if (s.kind === 'tile') return { x0: s.x, y0: s.y, x1: s.x, y1: s.y };
    const b = this.selectedBuilding;
    if (!b) return null;
    const { w, h } = buildingSize(b.type, b.rot);
    return { x0: b.x, y0: b.y, x1: b.x + w - 1, y1: b.y + h - 1 };
  }

  /** Select the object at `(x, y)`, or nothing when the tile is empty. Returns the result. */
  select(x: number, y: number): Selection | null {
    const b = this.world.buildingAt(x, y);
    if (b) this.selected = { kind: 'building', id: b.id };
    else this.selected = selectableTile(this.world, x, y) ? { kind: 'tile', x, y } : null;
    this.notify();
    return this.selected;
  }

  clearSelection(): void {
    if (!this.selected) return;
    this.selected = null;
    this.notify();
  }

  /** The selection can be demolished (everything but the hub and bare ground). */
  get canDeleteSelection(): boolean {
    const t = this.selectionTile;
    return t !== null && demolishTarget(this.world, t.x, t.y) !== null;
  }

  /** Demolish the selected object, as one undoable action. */
  deleteSelection(): boolean {
    const t = this.selectionTile;
    if (!t || !this.history.run(() => demolishAt(this.world, t.x, t.y))) return false;
    this.selected = null;
    this.notify();
    this.demolished();
    return true;
  }

  /** The selected object can be taken with the pipette (not the hub, nor bare ground). */
  get canPickSelection(): boolean {
    const t = this.selectionTile;
    if (!t) return false;
    const b = this.world.buildingAt(t.x, t.y);
    if (b) return b.type !== 'hub' && this.isAvailable(b.type);
    return this.world.beltAt(t.x, t.y) !== null || this.world.bridgeAt(t.x, t.y) !== null;
  }

  /** The selected object is a building that can be copied (not the hub). */
  get canCopySelection(): boolean {
    const b = this.selectedBuilding;
    return b !== null && b.type !== 'hub';
  }

  /**
   * Copy the selected building alone, as a zone holding just it, then switch to paste
   * mode: the copy keeps its orientation (and mirror, priority).
   */
  copySelection(): boolean {
    const rect = this.canCopySelection ? this.selectionRect : null;
    return rect !== null && this.copyRect(rect, false);
  }

  /** Pipette on the selected object: its tool and orientation, ready to build another. */
  pickSelection(): boolean {
    const t = this.selectionTile;
    return t !== null && this.pick(t);
  }

  // ---- zone selection ----------------------------------------------------

  /** The zone selected with the `select` tool, or null. */
  get selectedZone(): Rect | null {
    return this.tool === 'select' ? this.zone : null;
  }

  clearZone(): void {
    if (!this.zone) return;
    this.zone = null;
    this.notify();
  }

  /**
   * What copy and cut act on: the selected zone, else the selected building (not the hub).
   * Null when nothing is selected: the selection tray then hides them.
   */
  get copyTarget(): Rect | null {
    if (this.selectedZone) return this.selectedZone;
    return this.tool === 'none' && this.canCopySelection ? this.selectionRect : null;
  }

  /** Copy (or cut) the selected zone or building, then switch to paste mode. */
  copyTargetRect(cut: boolean): boolean {
    const rect = this.copyTarget;
    if (rect && this.copyRect(rect, cut)) {
      if (cut) this.demolished(rect);
      return true;
    }
    this.events.onError?.();
    return false;
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

  /** True while a paste preview waits on the map for `confirmPaste` (touch). */
  get pastePending(): boolean {
    return this.tool === 'paste' && this.pending !== null;
  }

  /** Put the paste preview down on a tile without a pointer (touch: at the screen centre). */
  placePastePreview(x: number, y: number): void {
    if (this.tool === 'paste') this.pending = { x, y };
  }

  /**
   * Paste where the preview was put down. On success the preview goes away; when nothing
   * could be placed it stays, to be moved somewhere else.
   */
  confirmPaste(): boolean {
    if (!this.pastePending) return false;
    const placed = this.history.run(() =>
      this.pastePlans(null).reduce((n, p) => n + applyPaste(this.world, p), 0),
    );
    if (placed > 0) {
      this.pending = null;
      this.built();
    } else {
      this.events.onError?.();
    }
    return placed > 0;
  }

  // ---- pointer -----------------------------------------------------------

  pointerMove(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.tool === 'paste') {
      if (mods.touch) {
        if (this.touchPaste) this.pending = { x, y };
        return;
      }
      // A mouse takes over: the preview follows it again.
      this.pending = null;
    }
    if (this.drag && (x !== this.drag.x || y !== this.drag.y)) this.drag.moved = true;
    if (this.drag?.trail) extendTrail(this.drag.trail, x, y);
    const m = this.moving;
    if (m && (x !== m.grabX || y !== m.grabY)) m.moved = true;
  }

  /** The gesture was interrupted (system, second finger): drop the drag, build nothing. */
  pointerCancel(): void {
    this.drag = null;
    this.moving = null;
    if (this.touchPaste) {
      // The preview goes back to where it was before this finger moved it.
      this.pending = this.pendingBefore;
      this.touchPaste = false;
    }
  }

  /** No pointer is over the map any more (finger lifted): no ghost, no hovered tile. */
  clearHover(): void {
    this.hover = null;
    this.drag = null;
    this.moving = null;
  }

  /**
   * A press at `(x, y)` without a tool would grab a building to move it. With the mouse any
   * movable building can be dragged; a finger only drags the selected one (otherwise it
   * moves the map), or any one after a long press.
   */
  grabsAt(x: number, y: number, touch: boolean): boolean {
    if (this.tool !== 'none') return false;
    const b = this.world.buildingAt(x, y);
    if (!b || !isMovable(b)) return false;
    return !touch || this.selectedBuilding === b;
  }

  /**
   * A gesture is under way: a drag (belt, zone, paste, building row), a building lifted to
   * move it, or a finger placing the paste preview.
   */
  get gesturing(): boolean {
    return this.drag !== null || this.moving !== null || this.touchPaste;
  }

  /** A building is being dragged (and has left its tile). */
  get isMoving(): boolean {
    return this.moving?.moved === true;
  }

  /** Where the building being dragged would go, with its belts. */
  private movePlan(): MovePlan | null {
    const m = this.moving;
    const h = this.hover;
    const b = m ? this.world.state.buildings.get(m.id) : undefined;
    if (!m || !h || !b) return null;
    const base = rotatedOrigin(b, m.rot - b.rot);
    const x = base.x + h.x - m.grabX;
    const y = base.y + h.y - m.grabY;
    const at = `${m.id}|${x}|${y}|${base.rot}`;
    if (this.moveCache?.at !== at) {
      this.moveCache = { at, plan: planMove(this.world, m.id, x, y, base.rot) };
    }
    return this.moveCache.plan;
  }

  pointerDown(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    if (this.tool === 'paste' && mods.touch) {
      this.pendingBefore = this.pending;
      this.pending = { x, y };
      this.touchPaste = true;
      return;
    }
    if (this.tool === 'belt' && mods.alt) return; // Alt+click = priority (on release)
    const t = this.tool;
    if (t === 'none' && this.grabsAt(x, y, mods.touch === true)) {
      const b = this.world.buildingAt(x, y);
      if (b) this.moving = { id: b.id, grabX: x, grabY: y, rot: b.rot, moved: false };
      this.moveCache = null;
      return;
    }
    if (t === 'belt' || t === 'paste' || isAreaTool(t) || isFreeBuilding(t)) {
      this.drag = { x, y, moved: false };
      if (t === 'belt' && this.beltMode === 'free') this.drag.trail = [{ x, y }];
    }
  }

  pointerUp(x: number, y: number, mods: Modifiers): void {
    this.hover = { x, y };
    this.ctrl = mods.ctrl;
    const tool = this.tool;
    const drag = this.drag;
    this.drag = null;
    if (drag?.trail) extendTrail(drag.trail, x, y);
    if (tool === 'paste' && mods.touch) {
      // The finger only puts the preview down: `confirmPaste` builds.
      if (this.touchPaste) this.pending = { x, y };
      this.touchPaste = false;
      return;
    }
    const run = <T>(fn: () => T): T => this.history.run(fn);
    const moving = this.moving;
    this.moving = null;
    if (tool === 'none' && moving?.moved) {
      this.moving = moving;
      const plan = this.movePlan();
      this.moving = null;
      this.moveCache = null;
      if (plan && run(() => applyMove(this.world, plan))) {
        this.selected = { kind: 'building', id: moving.id };
        this.notify();
        this.built();
      } else {
        this.events.onError?.();
      }
      return;
    }
    if (tool === 'none' || tool === 'marker') {
      const marker = this.world.state.markers.get(key(x, y));
      if (marker || tool === 'marker') this.events.onMarker?.(x, y, marker?.text ?? null);
      if (tool === 'none') this.select(x, y);
      return;
    }
    if (tool === 'priority' || (tool === 'belt' && mods.alt && !drag)) {
      if (run(() => togglePriorityAt(this.world, x, y)) !== 'none') this.built();
      else this.events.onError?.();
      return;
    }
    if (tool === 'bridge') {
      const plan = planManualBridge(this.world, x, y, this.beltDir);
      if (plan) {
        run(() => this.world.setBridge(x, y, plan.h, plan.v));
        this.built();
      } else this.events.onError?.();
      return;
    }
    if (tool === 'belt') {
      const plan = this.beltPlan(drag);
      if (plan.length > 0 && run(() => applyBeltPlan(this.world, plan)) > 0) this.built();
      else if (plan.every((t) => t.status === 'blocked')) this.events.onError?.();
      return;
    }
    if (tool === 'extractor') {
      if (run(() => applyBuildingPlan(this.world, planExtractor(this.world, x, y)))) this.built();
      else this.events.onError?.();
      return;
    }
    if (tool === 'edition') {
      const b = this.world.buildingAt(x, y);
      if (b) this.applyEditionOn(b, this.variant);
      // Belts and bridges take no edition yet (PLAN-recompenses §3.4).
      else if (this.world.beltAt(x, y) || this.world.bridgeAt(x, y)) this.events.onError?.();
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
      if (placed > 0) this.built();
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
      if (placed > 0) this.built();
      else this.events.onError?.();
    }
  }

  private applyArea(tool: AreaTool, drag: Drag | null): void {
    if (!this.hover) return;
    const rect = selectionRect(drag ?? this.hover, this.hover);
    if (tool === 'select') {
      // A drag selects a zone; a simple click drops it.
      this.zone = drag?.moved ? rect : null;
      this.notify();
      return;
    }
    if (tool === 'demolish') {
      // A simple click demolishes one object; a drag, the whole zone.
      const n = drag?.moved
        ? this.history.run(() => demolishArea(this.world, rect))
        : this.history.run(() =>
            demolishAt(this.world, this.hover?.x ?? 0, this.hover?.y ?? 0) ? 1 : 0,
          );
      if (n > 0) this.demolished(drag?.moved ? rect : null);
    } else if (tool === 'clear') {
      this.events.onClear?.(clearArea(this.world, rect), rect);
    } else if (this.copyRect(rect, tool === 'cut')) {
      if (tool === 'cut') this.demolished(rect);
      // A copy changes nothing on the map: the sound of a build, no effect.
      else this.built(NOTHING_TOUCHED);
    } else {
      this.events.onError?.();
    }
  }

  /**
   * `Delete`: removes the clipboard entry in paste mode, else the selected object, else the
   * hovered one.
   */
  deletePressed(): void {
    if (this.tool === 'paste') {
      this.removeClip();
      return;
    }
    if (this.tool === 'none' && this.selection) {
      this.deleteSelection();
      return;
    }
    const h = this.hover;
    if (h && this.history.run(() => demolishAt(this.world, h.x, h.y))) this.demolished();
  }

  /**
   * `E` (hovered tile) or a long press (`at`): pick the object's tool and orientation
   * (PLAN §8.2). Returns false when there is nothing to pick.
   */
  pick(at: { x: number; y: number } | null = this.hover): boolean {
    const h = at;
    if (!h) return false;
    const b = this.world.buildingAt(h.x, h.y);
    if (b && b.type !== 'hub') {
      if (!this.isAvailable(b.type)) return false;
      this.rot = b.rot;
      this.forceTool(b.type);
      return true;
    }
    if (this.world.bridgeAt(h.x, h.y) && this.isAvailable('bridge')) {
      this.forceTool('bridge');
      return true;
    }
    const belt = this.world.beltAt(h.x, h.y);
    if (belt) {
      const d = singleOutput(belt);
      if (d !== null) this.rot = normalizeRot(d - 1); // beltDir = rot + 1 (East at 0)
      this.forceTool('belt');
      return true;
    }
    return false;
  }

  /** Create, edit or delete (empty text) a marker, as one undoable action. */
  setMarker(x: number, y: number, text: string): void {
    this.history.run(() => this.world.setMarker(x, y, text.trim() === '' ? null : text.trim()));
  }

  undo(): boolean {
    this.drag = null;
    if (!this.history.undo()) return false;
    this.events.onRestore?.(this.history.lastTouched());
    return true;
  }

  redo(): boolean {
    this.drag = null;
    if (!this.history.redo()) return false;
    this.events.onRestore?.(this.history.lastTouched());
    return true;
  }

  get hovered(): { x: number; y: number } | null {
    return this.hover;
  }

  /** Size of the zone being dragged, for the hint. */
  get dragArea(): { w: number; h: number } | null {
    if (!this.drag?.moved || !this.hover || !isAreaTool(this.tool)) return null;
    return rectSize(selectionRect(this.drag, this.hover));
  }

  private beltPlan(drag: Drag | null): PlannedBelt[] {
    if (!this.hover) return [];
    if (drag?.moved && drag.trail) return planBeltPath(this.world, trailToPath(drag.trail));
    if (drag?.moved) {
      return planBeltPath(
        this.world,
        computeLPath(drag.x, drag.y, this.hover.x, this.hover.y, this.ctrl !== this.elbowSwap),
      );
    }
    const at = drag ?? this.hover;
    return planSingleBelt(this.world, at.x, at.y, this.beltDir);
  }

  private operatorPlans(type: FreeBuildingType, drag: Drag | null): BuildingPlan[] {
    if (!this.hover) return [];
    const from = drag ?? this.hover;
    const to = drag?.moved ? this.hover : from;
    return planOperatorRow(this.world, type, from, to, this.rot);
  }

  private pastePlans(drag: Drag | null): PastePlan[] {
    const clip = this.currentClip();
    if (!clip) return [];
    // A preview put down by a finger is a single copy, where it was put.
    if (this.pending) return planPasteRow(this.world, clip, this.pending, this.pending);
    if (!this.hover) return [];
    const from = drag ?? this.hover;
    const to = drag?.moved ? this.hover : from;
    return planPasteRow(this.world, clip, from, to);
  }

  /**
   * Edition tool over `(x, y)`: the building recoloured when the edition can go on it, the
   * building (or belt, bridge) in red when it cannot, nothing when it already has it.
   */
  private editionGhost(x: number, y: number): Ghost {
    const ghost: Ghost = { belts: [], buildings: [], demolish: null, area: null };
    const b = this.world.buildingAt(x, y);
    if (!b) {
      if (this.world.beltAt(x, y) || this.world.bridgeAt(x, y)) {
        ghost.belts.push({ x, y, dir: 1, status: 'blocked', outputs: 0 });
      }
      return ghost;
    }
    const check = this.editionCheck(b);
    if (check === 'apply' || check === 'swap') {
      ghost.preview = { ...b, edition: this.variant, editionApplied: true };
    } else if (check !== 'same') {
      ghost.buildings.push({
        type: b.type,
        x: b.x,
        y: b.y,
        rot: b.rot,
        mirror: b.mirror === true,
        ok: false,
      });
    }
    return ghost;
  }

  ghost(): Ghost {
    const empty: Ghost = { belts: [], buildings: [], demolish: null, area: null };
    const tool = this.tool;
    const drag = this.drag;
    if (tool === 'paste') return pasteGhost(this.pastePlans(drag));
    if (tool === 'none') return this.moving?.moved ? moveGhost(this.world, this.movePlan()) : empty;
    // The selected zone stays drawn once the finger is up.
    if (tool === 'select' && this.zone && !drag?.moved) {
      return { ...empty, area: { rect: this.zone, kind: tool } };
    }
    if (!this.hover) return empty;
    if (tool === 'belt') return { ...empty, belts: this.beltPlan(drag) };
    if (tool === 'edition') return this.editionGhost(this.hover.x, this.hover.y);
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

function otherEdition(e: SpecialEdition): SpecialEdition {
  return e === 'brillante' ? 'legendaire' : 'brillante';
}

/** Something worth selecting on a tile without a building: a belt, a bridge or a deposit. */
function selectableTile(world: World, x: number, y: number): boolean {
  return (
    world.beltAt(x, y) !== null ||
    world.bridgeAt(x, y) !== null ||
    world.deposits.depositAt(x, y) !== null
  );
}

function firstDir(mask: number): Dir {
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) return d as Dir;
  return 1;
}

/** Building being moved: at its new place, with its rerouted belts; red lines left behind. */
function moveGhost(world: World, plan: MovePlan | null): Ghost {
  const ghost: Ghost = { belts: [], buildings: [], demolish: null, area: null, fade: [] };
  if (!plan) return ghost;
  const moving = world.state.buildings.get(plan.id);
  // A building keeps its edition when it moves.
  ghost.buildings.push(
    moving?.edition ? { ...plan.building, edition: moving.edition } : plan.building,
  );
  ghost.belts.push(...plan.belts);
  for (const t of plan.broken) ghost.belts.push({ ...t, status: 'blocked', outputs: 0 });
  const b = world.state.buildings.get(plan.id);
  if (b) {
    const { w, h } = buildingSize(b.type, b.rot);
    ghost.fade?.push({ x0: b.x, y0: b.y, x1: b.x + w - 1, y1: b.y + h - 1 });
  }
  for (const t of plan.removed) ghost.fade?.push({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
  ghost.tints = plan.lines.flatMap((l) => l.tiles.map((t) => ({ ...t, line: l.line })));
  return ghost;
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
