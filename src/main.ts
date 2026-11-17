import './ui/styles.css';
import { Sfx } from './audio/sfx';
import { ToolController } from './build/tools';
import { CATCH_UP } from './config/balance';
import { CAMERA } from './config/keymap';
import { toSeed } from './core/rng';
import { installDebugApi, isDebugEnabled } from './debug/debugApi';
import { PerfMeter } from './debug/perfMeter';
import { countItems } from './debug/reference';
import { detectLocale, getLocale, setLocale } from './i18n';
import { Keyboard } from './input/keyboard';
import { PointerInput } from './input/pointer';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { SimLoop } from './sim/loop';
import { createInitialState } from './sim/state';
import { buildingSize } from './sim/entities';
import { World } from './sim/world';
import { BuildBar } from './ui/buildBar';
import { CatchUpBar } from './ui/catchUp';
import { PerfOverlay } from './ui/perfOverlay';
import { DebugPanel } from './ui/debugPanel';
import { EndScreen } from './ui/endScreen';
import { Hud } from './ui/hud';
import { rewardLabel } from './ui/labels';
import { watchLayout } from './ui/layout';
import { LevelsPanel } from './ui/panels/levels';
import { Toasts } from './ui/toasts';
import { TopBar } from './ui/topBar';
import { UpgradesPanel } from './ui/panels/upgrades';
import { DeliveredPanel } from './ui/panels/delivered';
import { TRACKS } from './config/balance';
import { isTrackUnlocked, isUpgradeReady } from './sim/upgrades';
import { StatusBar } from './ui/statusBar';
import { MarkerEditor } from './ui/markerEditor';
import { ToolActions } from './ui/toolActions';
import { describeTile, Tooltip } from './ui/tooltip';
import { ShortcutSheet } from './ui/shortcuts';
import { t } from './i18n';
import { DepositMap } from './world/chunks';
import { setAutoBuy } from './sim/progression';
import type { GameState } from './sim/state';
import { SaveManager } from './save/manager';
import {
  decodeSave,
  encodeSaveSync,
  exportFileName,
  exportText,
  importSave,
  readStorage,
  requestPersistence,
  SAVE_KEY,
  writeStorage,
} from './save/persist';
import { type CameraState, deserialize, serialize } from './save/serialize';
import { defaultSettings, loadSettings, storeSettings } from './save/settings';
import { HelpBubble, knownTips } from './ui/help';
import { GameMenu } from './ui/menu';

/** Longest frame delta honoured, in seconds (avoids a jump after a hitch). */
const MAX_FRAME_DT = 0.25;
/** Where an unreadable save is kept instead of being overwritten. */
const CORRUPT_KEY = 'sumflow.save.v1.corrupt';
/** Wheel pixels per clipboard step with Shift+wheel in paste mode. */
const WHEEL_STEP = 50;

/** Seed from `?seed=` when given, otherwise random (outside the simulation, so allowed). */
function initialSeed(search: string): number {
  const param = new URLSearchParams(search).get('seed');
  const parsed = param === null ? NaN : Number(param);
  return Number.isFinite(parsed) ? toSeed(parsed) : toSeed(Math.random() * 2 ** 32);
}

/** Tiles to outline for the object at `(x, y)`: a whole building, else the tile. */
function inspectedRect(
  world: World,
  x: number,
  y: number,
): { x: number; y: number; w: number; h: number } {
  const b = world.buildingAt(x, y);
  if (!b) return { x, y, w: 1, h: 1 };
  return { x: b.x, y: b.y, ...buildingSize(b.type, b.rot) };
}

type Loaded = { state: GameState; camera: CameraState | null; error: boolean };

/** The saved game if there is a readable one, else a new game (PLAN §11.3). */
async function loadGame(search: string): Promise<Loaded> {
  const text = readStorage(SAVE_KEY);
  if (text) {
    try {
      const { state, camera } = deserialize(await decodeSave(text));
      return { state, camera, error: false };
    } catch {
      // Keep the unreadable save aside rather than overwrite it.
      writeStorage(CORRUPT_KEY, text);
      return { state: createInitialState(initialSeed(search)), camera: null, error: true };
    }
  }
  return { state: createInitialState(initialSeed(search)), camera: null, error: false };
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('world');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('Missing #world canvas or #ui-root');
  }

  const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settings = loadSettings(
    defaultSettings(detectLocale(navigator.language), systemReducedMotion),
  );
  setLocale(settings.locale);
  document.documentElement.lang = getLocale();

  const loaded = await loadGame(location.search);
  const { state } = loaded;
  const world = new World(state, new DepositMap(state.seed));
  const loop = new SimLoop(world);
  const camera = new Camera();
  if (loaded.camera) {
    camera.x = loaded.camera.x;
    camera.y = loaded.camera.y;
    camera.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, loaded.camera.zoom));
  }
  const renderer = new Renderer(canvas, camera);
  const sfx = new Sfx();
  const saves = new SaveManager(world, camera);
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
  const applySettings = (): void => {
    renderer.reducedMotion = settings.reduceMotion;
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    renderer.showGrid = settings.showGrid;
    renderer.itemValuesAlways = settings.itemValues === 'always';
    sfx.volume = settings.volume / 100;
    saves.setInterval(settings.autosave);
  };
  applySettings();

  // HUD and help bubble stack in one column, whatever the height of the HUD.
  const topLeft = document.createElement('div');
  topLeft.className = 'top-left';
  uiRoot.append(topLeft);
  const hud = new Hud(topLeft);
  watchLayout(document.documentElement, (layout) => hud.setCompact(layout.compact));
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
  const togglePause = (): void => {
    loop.paused = !loop.paused;
    statusBar.setPaused(loop.paused);
  };
  const topBar = new TopBar(uiRoot, {
    pause: togglePause,
    undo,
    redo,
    marker: () => tools.setTool('marker'),
    home: goHome,
    delivered: () => deliveredPanel.toggle(),
    levels: () => levelsPanel.toggle(),
    upgrades: toggleUpgrades,
    menu: () => menu.toggle(),
  });
  const tooltip = new Tooltip(uiRoot);
  const shortcuts = new ShortcutSheet(uiRoot, () => tools.tool);
  const buildBar = new BuildBar(uiRoot, tools);
  const statusBar = new StatusBar(uiRoot, () => shortcuts.toggle());
  const toasts = new Toasts(uiRoot);
  const endScreen = new EndScreen(uiRoot);
  const toolActions = new ToolActions(uiRoot, tools);
  /** Tile inspected by a tap, on a touch screen (there is no hover to show the tooltip). */
  let pinned: { x: number; y: number } | null = null;
  tools.onChange(() => {
    pinned = null;
    // Paste mode without a hovering pointer (touch): show the preview at once, in the
    // middle of the screen, ready to be moved and confirmed.
    if (tools.tool === 'paste' && !pointer.hovering && !tools.pastePending) {
      const centre = pointer.tileAt(camera.viewW / 2, camera.viewH / 2);
      tools.placePastePreview(centre.x, centre.y);
    }
  });
  markerEditor = new MarkerEditor(uiRoot);
  const help = new HelpBubble(topLeft, state);
  const catchUpBar = new CatchUpBar(uiRoot);
  const perfOverlay = new PerfOverlay(uiRoot);
  const perf = new PerfMeter();

  /** Replace the save and reload: the page starts again on the new game. */
  const reloadWith = (text: string | null): void => {
    saves.suspend();
    if (text !== null) writeStorage(SAVE_KEY, text);
    location.reload();
  };
  const menu = new GameMenu(uiRoot, {
    newGame: (seed) => {
      const fresh = new World(
        createInitialState(seed ?? toSeed(Math.random() * 2 ** 32)),
        new DepositMap(0),
      );
      reloadWith(encodeSaveSync(serialize(fresh, { x: 0, y: 0, zoom: 1 })));
    },
    save: () => void saves.save(true),
    exportGame: () => {
      const name = exportFileName(new Date());
      const blob = new Blob([exportText(serialize(world, camera, new Date().toISOString()))], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.show(t('toast.exported', { file: name }));
    },
    importGame: (file) => {
      void file
        .text()
        .then((text) => importSave(text))
        .then(() => reloadWith(null))
        .catch(() => {
          sfx.error();
          toasts.show(t('toast.importError'));
        });
    },
    settings: () => settings,
    changeSettings: (next) => {
      const localeChanged = next.locale !== settings.locale;
      settings = next;
      storeSettings(settings);
      applySettings();
      if (localeChanged) {
        saves.saveSync();
        reloadWith(null);
      }
    },
    autoBuy: () => state.autoBuyUpgrades,
    setAutoBuy: (on) => setAutoBuy(state, on, world.emit),
    knownTips: () => knownTips(state),
    reshowHelp: () => {
      state.helpSeen.length = 0;
    },
  });

  // Once there is progress worth keeping, ask the browser not to evict the save.
  let persistenceAsked = false;
  saves.events.on('saved', ({ result }) => {
    if (persistenceAsked || result !== 'ok' || state.level < 2) return;
    persistenceAsked = true;
    void requestPersistence();
  });
  saves.events.on('saved', ({ result, manual }) => {
    if (result === 'quota') toasts.show(t('toast.saveQuota'));
    else if (result === 'unavailable') toasts.show(t('toast.saveFailed'));
    else if (manual) toasts.show(t('toast.saved'));
  });
  // Time spent with the tab hidden is simulated when it comes back (PLAN §11.1).
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = performance.now();
      void saves.save();
    } else if (hiddenAt !== null) {
      const away = (performance.now() - hiddenAt) / 1000;
      hiddenAt = null;
      if (away >= CATCH_UP.minSeconds) loop.queueCatchUp(away);
    }
  });
  window.addEventListener('beforeunload', () => saves.saveSync());
  // Mobile browsers often skip `beforeunload` and may kill the tab before the async save
  // of `visibilitychange` ends: `pagehide` writes synchronously.
  window.addEventListener('pagehide', () => saves.saveSync());
  if (loaded.error) toasts.show(t('toast.loadError'));
  // Soft click on every UI button (PLAN §12).
  uiRoot.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) sfx.click();
  });

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
  // Kept for the whole session: the context may be suspended again later (mobile). In the
  // capture phase, so the sound of the very gesture that unlocks it can play.
  const unlockAudio = (): void => sfx.unlock();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }

  const keyboard = new Keyboard(
    window,
    {
      onHome: goHome,
      onLevels: () => levelsPanel.toggle(),
      onUpgrades: toggleUpgrades,
      onDelivered: () => deliveredPanel.toggle(),
      onTogglePerf: () => perfOverlay.toggle(),
      onShortcuts: () => shortcuts.toggle(),
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
        if (shortcuts.isOpen) shortcuts.close();
        else if (endScreen.isOpen) endScreen.hide();
        else if (open) open.close();
        else if (tools.tool !== 'none') tools.cancel();
        else menu.open();
      },
      onQuickDemolish: () => tools.deletePressed(),
      onTogglePause: togglePause,
    },
    () => menu.isOpen || endScreen.isOpen || (markerEditor?.isOpen ?? false),
  );
  const pointer = new PointerInput(canvas, camera, {
    onDown: (x, y, mods) => tools.pointerDown(x, y, mods),
    onMove: (x, y, mods) => tools.pointerMove(x, y, mods),
    onUp: (x, y, mods) => tools.pointerUp(x, y, mods),
    onCancel: () => tools.pointerCancel(),
    onLeave: () => tools.clearHover(),
    // Touch: a tap without a tool inspects the object, a long press picks it (like `E`).
    onTap: (x, y) => {
      pinned = tools.tool === 'none' && describeTile(world, x, y).length > 0 ? { x, y } : null;
    },
    onLongPress: (x, y) => {
      if (!tools.pick({ x, y })) return false;
      sfx.click();
      navigator.vibrate?.(10);
      return true;
    },
    // Touch: with a tool one finger builds, without one it moves the map.
    buildsOnDrag: () => tools.tool !== 'none',
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
  if (debug) installDebugApi({ world, camera, loop, tools, saves, perf });

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
    pointer.inertia = !settings.reduceMotion;
    pointer.update(now);
    const hover = pointer.tileAt(pointer.x, pointer.y);
    // Keep the drag preview in sync with Ctrl even when the mouse is still. A finger
    // leaves no hovered tile behind: the gestures drive the tools themselves.
    if (pointer.hovering) {
      tools.pointerMove(hover.x, hover.y, { ctrl: keyboard.ctrl, shift: false, alt: false });
      pinned = null;
    }
    renderer.selection = pinned ? inspectedRect(world, pinned.x, pinned.y) : null;

    const simStart = performance.now();
    const ticks = loop.advance(dt, () => performance.now() - simStart > CATCH_UP.frameBudgetMs);
    const drawStart = performance.now();
    renderer.draw(world, tools.ghost(), now);
    const drawEnd = performance.now();
    catchUpBar.update(loop.catchUpProgress);
    if (perf.frame(now, drawStart - simStart, ticks, drawEnd - drawStart) && perfOverlay.visible) {
      perfOverlay.update(perf.stats, {
        tick: state.tick,
        items: countItems(world),
        belts: state.belts.size,
        buildings: state.buildings.size - 1,
      });
    }
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
    topBar.setPaused(loop.paused);
    toolActions.update();
    help.update();
    saves.update();
    statusBar.update(
      saves.lastSavedAt === null ? null : now - saves.lastSavedAt,
      pointer.inside ? hover : null,
    );
    const inspected = pointer.inside ? hover : pinned;
    tooltip.update(inspected ? describeTile(world, inspected.x, inspected.y) : []);
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

void bootstrap();
