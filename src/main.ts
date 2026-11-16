import './ui/styles.css';
import { ToolController } from './build/tools';
import { CAMERA } from './config/keymap';
import { toSeed } from './core/rng';
import { installDebugApi, isDebugEnabled } from './debug/debugApi';
import { detectLocale, getLocale, setLocale } from './i18n';
import { Keyboard } from './input/keyboard';
import { Mouse } from './input/mouse';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { SimLoop } from './sim/loop';
import { createInitialState } from './sim/state';
import { World } from './sim/world';
import { BuildBar } from './ui/buildBar';
import { DebugPanel } from './ui/debugPanel';
import { StatusBar } from './ui/statusBar';
import { describeTile, Tooltip } from './ui/tooltip';
import { DepositMap } from './world/chunks';

/** Longest frame delta honoured, in seconds (avoids a jump after a hitch). */
const MAX_FRAME_DT = 0.25;

/** Seed from `?seed=` when given, otherwise random (outside the simulation, so allowed). */
function initialSeed(search: string): number {
  const param = new URLSearchParams(search).get('seed');
  const parsed = param === null ? NaN : Number(param);
  return Number.isFinite(parsed) ? toSeed(parsed) : toSeed(Math.random() * 2 ** 32);
}

function bootstrap(): void {
  const canvas = document.getElementById('world');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('Missing #world canvas or #ui-root');
  }

  setLocale(detectLocale(navigator.language));
  document.documentElement.lang = getLocale();

  const state = createInitialState(initialSeed(location.search));
  const world = new World(state, new DepositMap(state.seed));
  const loop = new SimLoop(world);
  const camera = new Camera();
  const renderer = new Renderer(canvas, camera);
  const tools = new ToolController(world);

  const tooltip = new Tooltip(uiRoot);
  new BuildBar(uiRoot, tools);
  const statusBar = new StatusBar(uiRoot);

  const keyboard = new Keyboard(window, {
    onHome: () => camera.centerOn(0, 0),
    onTool: (tool) => tools.setTool(tool),
    onRotate: (delta) => tools.rotate(delta),
    onCancel: () => tools.cancel(),
    onQuickDemolish: () => tools.demolishHovered(),
    onTogglePause: () => {
      loop.paused = !loop.paused;
      statusBar.setPaused(loop.paused);
    },
  });
  const mouse = new Mouse(canvas, camera, {
    onDown: (x, y, mods) => tools.pointerDown(x, y, mods),
    onMove: (x, y, mods) => tools.pointerMove(x, y, mods),
    onUp: (x, y, mods) => tools.pointerUp(x, y, mods),
  });

  const debug = isDebugEnabled(location.search);
  const debugPanel = debug ? new DebugPanel(uiRoot) : null;
  if (debug) installDebugApi({ world, camera, loop });

  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - last) / 1000));
    last = now;

    const pan = keyboard.panVector();
    if (pan.dx !== 0 || pan.dy !== 0) {
      const speed = CAMERA.panSpeedPx * (pan.fast ? CAMERA.panShiftFactor : 1) * Math.min(dt, 0.1);
      const len = Math.hypot(pan.dx, pan.dy);
      // Keys move the view, so the world moves the opposite way.
      camera.panScreen((-pan.dx / len) * speed, (-pan.dy / len) * speed);
    }
    // Keep the drag preview in sync with Ctrl even when the mouse is still.
    const hover = mouse.tileAt(mouse.x, mouse.y);
    tools.pointerMove(hover.x, hover.y, { ctrl: keyboard.ctrl, shift: false, alt: false });

    loop.advance(dt);
    renderer.draw(world, tools.ghost());
    tooltip.update(mouse.inside ? describeTile(world, hover.x, hover.y) : []);
    debugPanel?.update({
      seed: state.seed,
      tick: state.tick,
      cursorX: hover.x,
      cursorY: hover.y,
      zoom: camera.zoom,
      deposit: world.deposits.depositAt(hover.x, hover.y)?.value ?? null,
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bootstrap();
