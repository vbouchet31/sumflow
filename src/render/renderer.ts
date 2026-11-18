import type { Ghost } from '../build/tools';
import { TICK_DT } from '../config/balance';
import { COLORS } from '../config/colors';
import { currentBeltSpeed } from '../sim/upgrades';
import type { World } from '../sim/world';
import type { Belt } from '../sim/entities';
import { RegionCache } from './cache';
import type { Camera } from './camera';
import { LOD } from './lod';
import { drawBelts, type InputsOf, straightInputs } from './layers/belts';
import { beltInputs } from './beltLinks';
import { drawBridges, drawPriorities } from './layers/bridges';
import { priorityTiles } from '../sim/priority';
import { drawBuildings } from './layers/buildings';
import { drawDeposits } from './layers/deposits';
import { drawGhosts } from './layers/ghosts';
import { drawGrid } from './layers/grid';
import { drawItems } from './layers/items';
import { drawMarkers } from './layers/markers';
import { drawWave } from './layers/wave';

/** Maximum device pixel ratio honoured by the canvas (PLAN §10.4). */
const MAX_DPR = 2;
/**
 * Frames the zoom must stay unchanged before caches are used: while zooming, every frame
 * has a new scale and cached bitmaps would be thrown away at once.
 */
const STABLE_FRAMES = 3;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Time (ms, same clock as `draw`'s `nowMs`) of the last level-complete wave. */
  waveStart: number | null = null;
  reducedMotion = false;
  /** Options (PLAN §9.4). */
  showGrid = true;
  itemValuesAlways = false;
  /** Tile rectangle outlined on the map: the object inspected by a tap (touch screens). */
  selection: { x: number; y: number; w: number; h: number } | null = null;
  private dpr = 1;
  private readonly depositCache = new RegionCache();
  private readonly beltCache = new RegionCache();
  private world: World | null = null;
  private unwatch: (() => void) | null = null;
  private inputsOf: InputsOf = straightInputs;
  private lastZoom = 0;
  /** Frames since the zoom last changed. */
  private stableFrames = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio));
    this.dpr = dpr;
    this.camera.setViewport(cssWidth, cssHeight);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Draw one frame in layer order (PLAN §10.2). Reads the world, never mutates it.
   * Deposits and belts come from off-screen caches once the zoom has settled.
   */
  draw(world: World, ghost: Ghost, nowMs: number): void {
    const { ctx, camera, dpr } = this;
    const { state } = world;
    this.watch(world);
    this.stableFrames = camera.zoom === this.lastZoom ? this.stableFrames + 1 : 0;
    this.lastZoom = camera.zoom;
    const cached = this.stableFrames >= STABLE_FRAMES && RegionCache.usable(camera, dpr);

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    if (this.showGrid) drawGrid(ctx, camera);
    if (cached) {
      this.depositCache.draw(ctx, camera, dpr, `${state.maxExtraction}`, (c, cam) =>
        drawDeposits(c, cam, world.deposits, state),
      );
    } else {
      drawDeposits(ctx, camera, world.deposits, state);
    }

    const v = camera.visibleTiles(1);
    // From zoom 0.6 chevrons move: only the tile bases are cached, chevrons are drawn live.
    const liveChevrons = camera.zoom >= LOD.full;
    // Below zoom 0.12 items and priorities are hidden: cached belts need no belt list at all.
    const needBelts = !cached || camera.zoom >= LOD.depositText;
    const belts = needBelts ? [...world.beltsInRect(v.x0, v.y0, v.x1, v.y1)] : [];
    // Chevrons follow simulation time, so they stop when the game is paused.
    const phase = (state.tick * TICK_DT * currentBeltSpeed(state)) % 1;
    if (cached) {
      this.beltCache.draw(ctx, camera, dpr, '', (c, cam, r) =>
        drawBelts(
          c,
          cam,
          [...world.beltsInRect(r.x0, r.y0, r.x1, r.y1)],
          0,
          liveChevrons ? 'base' : 'all',
          this.inputsOf,
        ),
      );
      if (liveChevrons) drawBelts(ctx, camera, belts, phase, 'chevrons', this.inputsOf);
    } else {
      drawBelts(ctx, camera, belts, phase, 'all', this.inputsOf);
    }
    const bridges = [...world.bridgesInRect(v.x0, v.y0, v.x1, v.y1)];
    drawBridges(ctx, camera, bridges, phase, this.itemValuesAlways);
    const buildings = [...world.buildingsInRect(v.x0, v.y0, v.x1, v.y1)];
    drawBuildings(ctx, camera, buildings, state, this.reducedMotion);
    drawItems(ctx, camera, belts, this.itemValuesAlways);
    if (camera.zoom >= LOD.depositText) {
      const lanes: Belt[] = [];
      for (const b of bridges) {
        if (b.h) lanes.push(b.h);
        if (b.v) lanes.push(b.v);
      }
      drawPriorities(ctx, camera, priorityTiles(world, belts.concat(lanes), buildings));
    }
    drawGhosts(ctx, camera, ghost);
    if (this.selection) {
      const sel = this.selection;
      const p = camera.worldToScreen(sel.x, sel.y);
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, sel.w * camera.scale - 2, sel.h * camera.scale - 2);
    }
    drawMarkers(ctx, camera, state.markers.values());
    if (this.waveStart !== null && !this.reducedMotion)
      drawWave(ctx, camera, nowMs - this.waveStart);
  }

  /** Keep the belt cache in sync with the world being drawn. */
  private watch(world: World): void {
    if (world === this.world) return;
    this.unwatch?.();
    this.world = world;
    this.beltCache.clear();
    this.depositCache.clear();
    this.inputsOf = beltInputs(world);
    // A belt is drawn joined to its neighbours: a change also redraws the tiles around it.
    const offBelt = world.events.on('beltChanged', ({ x, y }) =>
      this.beltCache.invalidateRect(x - 1, y - 1, x + 1, y + 1),
    );
    const offTiles = world.events.on('tilesChanged', ({ x0, y0, x1, y1 }) =>
      this.beltCache.invalidateRect(x0 - 1, y0 - 1, x1 + 1, y1 + 1),
    );
    this.unwatch = () => {
      offBelt();
      offTiles();
    };
  }
}
