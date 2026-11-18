import { TILE_PX } from '../config/keymap';
import { t } from '../i18n';
import { Camera } from '../render/camera';
import { Renderer } from '../render/renderer';
import { DEMOS, type DemoId } from '../tutorial/scenes';
import { DemoScript } from '../tutorial/script';
import { toolFace } from './buildBar';
import { el } from './dom';

/** Pause on the finished factory before the demo starts again, in milliseconds. */
const HOLD_MS = 1200;
/** Fade between two loops. */
const FADE_MS = 350;
/** Longest frame step honoured (a background tab must not fast-forward the script). */
const MAX_STEP_MS = 100;
/** Zoom range of the demo camera: values on items stay readable. */
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.1;

export interface DemoOptions {
  /** Draw a finger instead of a mouse arrow, and play the gestures of a touch screen. */
  touch: boolean;
  /** Show the finished factory, still, instead of the animation. */
  still: boolean;
}

/**
 * Animated demo of a tutorial card (PLAN §7.5): a `DemoScript` drawn with the game's own
 * renderer in a small canvas, the virtual pointer on top, the selected tool and the
 * caption of the current step below. Loops until `stop`.
 */
export class TutorialDemo {
  readonly element: HTMLElement;
  private readonly canvas = el('canvas', 'tut-canvas');
  private readonly toolChip = el('div', 'tut-tool');
  private readonly caption = el('p', 'tut-caption');
  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly ctx: CanvasRenderingContext2D | null;
  private script: DemoScript;
  private frame = 0;
  private last = 0;
  /** Time spent on the finished factory, while holding before the next loop. */
  private holding = 0;
  /** Time since the current loop started. */
  private age = 0;
  private dpr = 1;
  private readonly observer: ResizeObserver | null = null;

  constructor(
    private readonly id: DemoId,
    private readonly options: DemoOptions,
  ) {
    this.canvas.setAttribute('aria-hidden', 'true');
    this.caption.setAttribute('aria-live', 'polite');
    this.toolChip.setAttribute('aria-hidden', 'true');
    this.element = el(
      'div',
      'tut-demo',
      el('div', 'tut-stage', this.canvas, this.toolChip),
      this.caption,
    );
    this.renderer = new Renderer(this.canvas, this.camera);
    this.renderer.itemValuesAlways = true;
    this.renderer.reducedMotion = options.still;
    this.ctx = this.canvas.getContext('2d');
    this.script = this.newScript();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(this.canvas.parentElement ?? this.canvas);
    }
  }

  /** Start (or restart) the animation. Call once the element is in the page. */
  start(): void {
    this.fit();
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    const loop = (now: number): void => {
      this.step(Math.min(MAX_STEP_MS, Math.max(0, now - this.last)));
      this.last = now;
      this.draw(now);
      if (!this.options.still) this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
  }

  private newScript(): DemoScript {
    const script = new DemoScript(DEMOS[this.id], this.options.touch);
    if (this.options.still) script.finish();
    return script;
  }

  private step(ms: number): void {
    if (this.options.still) return;
    this.age += ms;
    if (this.script.done) {
      this.script.advance(ms);
      this.holding += ms;
      if (this.holding >= HOLD_MS + FADE_MS) {
        this.script = this.newScript();
        this.holding = 0;
        this.age = 0;
      }
      return;
    }
    this.script.advance(ms);
  }

  /** Size the canvas to its box and frame the scene. */
  private fit(): void {
    const box = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, Math.round(box.clientWidth));
    const h = Math.max(1, Math.round(box.clientHeight));
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.renderer.resize(w, h, this.dpr);
    const { view } = DEMOS[this.id];
    const tilesW = view.x1 - view.x0 + 1 + 1;
    const tilesH = view.y1 - view.y0 + 1 + 1;
    const zoom = Math.min(w / (tilesW * TILE_PX), h / (tilesH * TILE_PX));
    this.camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.camera.centerOn((view.x0 + view.x1 + 1) / 2, (view.y0 + view.y1 + 1) / 2);
    if (this.options.still) this.draw(performance.now());
  }

  private draw(now: number): void {
    const script = this.script;
    this.renderer.draw(script.world, script.tools.ghost(), now);
    const ctx = this.ctx;
    if (ctx) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (script.pointer.visible) this.drawPointer(ctx);
      // Fade out at the end of a loop, fade in at the start of the next.
      const fade = this.options.still
        ? 0
        : script.done
          ? (this.holding - HOLD_MS) / FADE_MS
          : 1 - this.age / FADE_MS;
      if (fade > 0) {
        ctx.globalAlpha = Math.min(1, fade);
        ctx.fillStyle = '#1c1714';
        ctx.fillRect(0, 0, this.camera.viewW, this.camera.viewH);
      }
      ctx.restore();
    }
    this.updateLabels();
  }

  private drawPointer(ctx: CanvasRenderingContext2D): void {
    const { pointer } = this.script;
    const p = this.camera.worldToScreen(pointer.x, pointer.y);
    if (this.options.touch) {
      // A fingertip: a soft disc, with a ring while it touches the screen.
      const r = 13;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pointer.pressed ? 'rgb(255 255 255 / 55%)' : 'rgb(255 255 255 / 30%)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(255 255 255 / 85%)';
      ctx.stroke();
      if (pointer.pressed) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgb(255 255 255 / 40%)';
        ctx.stroke();
      }
      return;
    }
    // A mouse arrow, tip on the point; a ring shows the button held down.
    if (pointer.pressed) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(255 255 255 / 25%)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + 18);
    ctx.lineTo(p.x + 4.5, p.y + 13.5);
    ctx.lineTo(p.x + 8, p.y + 21);
    ctx.lineTo(p.x + 11, p.y + 19.5);
    ctx.lineTo(p.x + 7.5, p.y + 12.5);
    ctx.lineTo(p.x + 13, p.y + 12.5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1c1714';
    ctx.stroke();
  }

  private chipTool = '';
  private captionText = '';

  /** Selected tool (like its build bar button) and caption of the current step. */
  private updateLabels(): void {
    const tool = this.script.tool;
    if (tool !== this.chipTool) {
      this.chipTool = tool;
      const face = toolFace(tool);
      this.toolChip.hidden = face === null;
      if (face) {
        this.toolChip.replaceChildren(
          el('span', 'build-icon', face.icon),
          el('span', 'tut-tool-label', t(face.label)),
        );
      }
    }
    const c = this.script.caption;
    const text = c ? t(c.key, c.params) : '';
    if (text !== this.captionText) {
      this.captionText = text;
      this.caption.textContent = text;
    }
  }
}
