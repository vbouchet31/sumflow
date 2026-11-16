import './ui/styles.css';
import { Sfx } from './audio/sfx';
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
import { EndScreen } from './ui/endScreen';
import { Hud } from './ui/hud';
import { rewardLabel } from './ui/labels';
import { LevelsPanel } from './ui/panels/levels';
import { Toasts } from './ui/toasts';
import { TopBar } from './ui/topBar';
import { UpgradesPanel } from './ui/panels/upgrades';
import { DeliveredPanel } from './ui/panels/delivered';
import { TRACKS } from './config/balance';
import { isTrackUnlocked, isUpgradeReady } from './sim/upgrades';
import { StatusBar } from './ui/statusBar';
import { MarkerEditor } from './ui/markerEditor';
import { ToolHint } from './ui/toolHint';
import { describeTile, Tooltip } from './ui/tooltip';
import { t } from './i18n';
import { DepositMap } from './world/chunks';

/** Longest frame delta honoured, in seconds (avoids a jump after a hitch). */
const MAX_FRAME_DT = 0.25;
/** Wheel pixels per clipboard step with Shift+wheel in paste mode. */
const WHEEL_STEP = 50;

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
  const sfx = new Sfx();
  let markerEditor: MarkerEditor | null = null;
  const tools = new ToolController(world, {
    onBuild: () => sfx.place(),
    onDemolish: () => sfx.demolish(),
    onError: () => sfx.error(),
    onClear: (n) => (n > 0 ? sfx.demolish() : sfx.error()),
    onMarker: (x, y, text) => {
      markerEditor?.open(text, (value) => {
        if (value === null) return;
        tools.setMarker(x, y, value);
        sfx.place();
      });
    },
  });
  renderer.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hud = new Hud(uiRoot);
  const goHome = (): void => camera.centerOn(0, 0);
  const levelsPanel = new LevelsPanel(uiRoot, world);
  const upgradesPanel = new UpgradesPanel(uiRoot, world);
  const deliveredPanel = new DeliveredPanel(uiRoot, world);
  const panels = [levelsPanel, upgradesPanel, deliveredPanel];
  for (const p of panels) p.onOpen = () => panels.forEach((o) => o !== p && o.close());
  const upgradesAvailable = (): boolean => TRACKS.some((tr) => isTrackUnlocked(state, tr));
  const toggleUpgrades = (): void => {
    if (upgradesAvailable()) upgradesPanel.toggle();
  };
  const undo = (): void => {
    if (!tools.undo()) sfx.error();
  };
  const redo = (): void => {
    if (!tools.redo()) sfx.error();
  };
  const topBar = new TopBar(uiRoot, {
    undo,
    redo,
    marker: () => tools.setTool('marker'),
    home: goHome,
    delivered: () => deliveredPanel.toggle(),
    levels: () => levelsPanel.toggle(),
    upgrades: toggleUpgrades,
  });
  const tooltip = new Tooltip(uiRoot);
  const buildBar = new BuildBar(uiRoot, tools);
  const statusBar = new StatusBar(uiRoot);
  const toasts = new Toasts(uiRoot);
  const endScreen = new EndScreen(uiRoot);
  const toolHint = new ToolHint(uiRoot, tools);
  markerEditor = new MarkerEditor(uiRoot);

  world.events.on('levelCompleted', ({ level, reward, final }) => {
    renderer.waveStart = performance.now();
    sfx.levelComplete();
    toasts.show(
      t('toast.levelDone', { n: level }),
      reward ? t('toast.unlocked', { reward: rewardLabel(reward) }) : undefined,
    );
    if (final) endScreen.show(world.state);
  });
  world.events.on('upgradeReady', ({ track }) => {
    if (state.autoBuyUpgrades) return;
    sfx.upgradeReady();
    toasts.show(t('toast.upgradeReady', { track: t(`track.${track}`) }));
  });
  world.events.on('upgradeBought', ({ track, level }) => {
    toasts.show(t('toast.upgradeBought', { track: t(`track.${track}`), n: level }));
  });
  // The audio context needs a user gesture (PLAN §12).
  const unlockAudio = (): void => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  const keyboard = new Keyboard(window, {
    onHome: goHome,
    onLevels: () => levelsPanel.toggle(),
    onUpgrades: toggleUpgrades,
    onDelivered: () => deliveredPanel.toggle(),
    onTool: (tool) => {
      if (tool === 'paste' && !tools.isAvailable('paste')) sfx.error();
      else tools.setTool(tool);
    },
    onRotate: (delta) => tools.rotate(delta),
    onMirror: () => tools.mirror(),
    onPick: () => tools.pick(),
    onUndo: undo,
    onRedo: redo,
    onCancel: () => {
      const open = panels.find((p) => p.isOpen);
      if (endScreen.isOpen) endScreen.hide();
      else if (open) open.close();
      else tools.cancel();
    },
    onQuickDemolish: () => tools.deletePressed(),
    onTogglePause: () => {
      loop.paused = !loop.paused;
      statusBar.setPaused(loop.paused);
    },
  });
  const mouse = new Mouse(canvas, camera, {
    onDown: (x, y, mods) => tools.pointerDown(x, y, mods),
    onMove: (x, y, mods) => tools.pointerMove(x, y, mods),
    onUp: (x, y, mods) => tools.pointerUp(x, y, mods),
    onWheel: (delta, mods) => {
      if (!mods.shift || tools.tool !== 'paste') return false;
      // Accumulate so a trackpad does not skip through the history.
      wheelAcc += delta;
      if (Math.abs(wheelAcc) >= WHEEL_STEP) {
        tools.cycleClip(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
      }
      return true;
    },
  });

  let wheelAcc = 0;
  const debug = isDebugEnabled(location.search);
  const debugPanel = debug ? new DebugPanel(uiRoot) : null;
  if (debug) installDebugApi({ world, camera, loop, tools });

  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  };
  window.addEventListener('resize', resize);
  resize();

  let unlockedKey = '';
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
    renderer.draw(world, tools.ghost(), now);
    hud.update(world);
    for (const p of panels) p.update();
    topBar.setVisible('upgrades', upgradesAvailable());
    topBar.setBadge(
      'upgrades',
      TRACKS.some((tr) => isUpgradeReady(state, tr)),
    );
    const barKey = `${state.unlockedBuildings.length}|${state.unlockedFeatures.length}|${state.clipboard.length}`;
    if (barKey !== unlockedKey) {
      unlockedKey = barKey;
      buildBar.refresh();
    }
    topBar.setEnabled('undo', tools.history.canUndo);
    topBar.setEnabled('redo', tools.history.canRedo);
    topBar.setPressed('marker', tools.tool === 'marker');
    toolHint.update();
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
