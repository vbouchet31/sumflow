import './ui/styles.css';
import { Sfx } from './audio/sfx';
import { ToolController } from './build/tools';
import { CATCH_UP, HUB } from './config/balance';
import { FONT_NUM } from './config/colors';
import { CAMERA } from './config/keymap';
import { toSeed } from './core/rng';
import { parseSeed } from './core/seed';
import { installDebugApi, isDebugEnabled } from './debug/debugApi';
import { PerfMeter } from './debug/perfMeter';
import { countItems } from './debug/reference';
import { detectLocale, getLocale, setLocale } from './i18n';
import { Keyboard } from './input/keyboard';
import { PointerInput } from './input/pointer';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { effectEvents } from './render/layers/effects';
import { SimLoop } from './sim/loop';
import { createInitialState } from './sim/state';
import { World } from './sim/world';
import { BuildBar } from './ui/buildBar';
import { CatchUpBar } from './ui/catchUp';
import { PerfOverlay } from './ui/perfOverlay';
import { DebugPanel } from './ui/debugPanel';
import { EndScreen } from './ui/endScreen';
import { Hud } from './ui/hud';
import { cardLabel } from './ui/labels';
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
import { SelectionBubble } from './ui/selectionBubble';
import { describeTile, Tooltip } from './ui/tooltip';
import { t } from './i18n';
import { DepositMap } from './world/chunks';
import { chooseCard, ensureOffer, setAutoBuy } from './sim/progression';
import { parsePickMode, resolvePending } from './sim/autoPick';
import type { GameState, StoredOffer } from './sim/state';
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
import { SaveError } from './save/schema';
import { type CameraState, deserialize, serialize } from './save/serialize';
import { defaultSettings, loadSettings, storeSettings } from './save/settings';
import { knownTips, markSeen, pendingTips, tipContent } from './ui/help';
import { TutorialCard } from './ui/tutorial';
import { OfferScreen } from './ui/offerScreen';
import { canOpenOffer, OFFER_INTRO_ID, OfferSeries, offerView } from './ui/offerInfo';
import { GameMenu } from './ui/menu';

/** Longest frame delta honoured, in seconds (avoids a jump after a hitch). */
const MAX_FRAME_DT = 0.25;
/** Where an unreadable save is kept instead of being overwritten. */
const CORRUPT_KEY = 'sumflow.save.v1.corrupt';
/** Wheel pixels per clipboard step with Shift+wheel in paste mode. */
const WHEEL_STEP = 50;

/**
 * Seed from `?seed=` when given (a number or any text, e.g. `?seed=Vincent`), otherwise
 * random (outside the simulation, so allowed).
 */
function initialSeed(search: string): number {
  const param = new URLSearchParams(search).get('seed');
  return (param === null ? null : parseSeed(param)) ?? toSeed(Math.random() * 2 ** 32);
}

/** Why the saved game could not be loaded, if it could not. */
type LoadError = 'invalid' | 'outdated' | null;
type Loaded = { state: GameState; camera: CameraState | null; error: LoadError };

/** The saved game if there is a readable one, else a new game (PLAN §11.3). */
async function loadGame(search: string): Promise<Loaded> {
  const text = readStorage(SAVE_KEY);
  if (text) {
    try {
      const { state, camera } = deserialize(await decodeSave(text));
      return { state, camera, error: null };
    } catch (e) {
      // Keep the unreadable (or too old) save aside rather than overwrite it.
      writeStorage(CORRUPT_KEY, text);
      const error = e instanceof SaveError && e.reason === 'outdated' ? 'outdated' : 'invalid';
      return { state: createInitialState(initialSeed(search)), camera: null, error };
    }
  }
  return { state: createInitialState(initialSeed(search)), camera: null, error: null };
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
  // The map is written with the handwriting font: once it has loaded, redraw what was cached
  // with the fallback font (numbers on deposits and items).
  void document.fonts.load(`16px ${FONT_NUM}`).then(() => renderer.refreshText());
  const sfx = new Sfx();
  const saves = new SaveManager(world, camera);
  let markerEditor: MarkerEditor | null = null;
  // Chalk effects follow the clock of the frames (`requestAnimationFrame`).
  const fx = effectEvents(renderer.effects, () => performance.now());
  const tools = new ToolController(world, {
    onBuild: (touched) => {
      sfx.place();
      fx.onBuild(touched);
    },
    onDemolish: (touched) => {
      sfx.demolish();
      fx.onDemolish(touched);
    },
    onError: () => sfx.error(),
    onClear: (n, area) => {
      if (n > 0) sfx.demolish();
      else sfx.error();
      fx.onClear(n, area);
    },
    onRestore: fx.onRestore,
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
    tools.beltMode = settings.beltDraw;
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
    reward: () => reopenOffer(),
  });
  const tooltip = new Tooltip(uiRoot);
  const buildBar = new BuildBar(uiRoot, tools);
  const statusBar = new StatusBar(uiRoot, isDebugEnabled(location.search));
  const toasts = new Toasts(uiRoot);
  const endScreen = new EndScreen(uiRoot);
  const toolActions = new ToolActions(uiRoot, tools, (x, y) => describeTile(world, x, y)[0] ?? '');
  const selectionBubble = new SelectionBubble(uiRoot, tools, camera);
  tools.onChange(() => {
    // Paste mode without a hovering pointer (touch): show the preview at once, in the
    // middle of the screen, ready to be moved and confirmed.
    if (tools.tool === 'paste' && !pointer.hovering && !tools.pastePending) {
      const centre = pointer.tileAt(camera.viewW / 2, camera.viewH / 2);
      tools.placePastePreview(centre.x, centre.y);
    }
  });
  markerEditor = new MarkerEditor(uiRoot);
  const tutorial = new TutorialCard(uiRoot);
  // Demos show a finger or a mouse arrow, after the pointer the player last used.
  let lastPointer: string | null = null;
  window.addEventListener('pointerdown', (e) => (lastPointer = e.pointerType), {
    capture: true,
    passive: true,
  });
  const usesTouch = (): boolean =>
    lastPointer === null ? window.matchMedia('(pointer: coarse)').matches : lastPointer !== 'mouse';
  const openTutorial: TutorialCard['show'] = (tip, options) => {
    tutorial.touch = usesTouch();
    tutorial.still = settings.reduceMotion;
    // Picture and text parameters read from the game when the card opens (value, editions…).
    tutorial.show(tip, { ...options, ...tipContent(tip, state) });
  };
  // `?tutorial=0` keeps the cards from opening by themselves (end-to-end tests).
  const autoTutorials = new URLSearchParams(location.search).get('tutorial') !== '0';
  // `?pick=natural|first|random` chooses the pending offers by itself (end-to-end tests);
  // without it (or with `none`) the player chooses on the screen.
  const pickMode = parsePickMode(new URLSearchParams(location.search).get('pick'));
  const choiceScreen = pickMode === 'none';
  /** Cards shown one after the other: position in the series and its length. */
  const series = { index: 0, total: 0 };
  /** Open the next pending card when nothing else is on screen. Cheap: call every frame. */
  const showPendingTip = (): void => {
    if (!autoTutorials || tutorial.isOpen || menu.isOpen || endScreen.isOpen) return;
    if (offerScreen.isOpen) return;
    if (markerEditor?.isOpen) return;
    const pending = pendingTips(state);
    const tip = pending[0];
    if (!tip) {
      series.index = 0;
      series.total = 0;
      return;
    }
    series.index += 1;
    series.total = Math.max(series.total, series.index - 1 + pending.length);
    openTutorial(tip, {
      index: series.index,
      total: series.total,
      onClose: () => {
        markSeen(state, tip.id);
        // The series ends with its last card, so the next unlock starts a new one.
        if (pendingTips(state).length === 0) series.index = series.total = 0;
      },
    });
  };

  // ---- Reward choice screen (PLAN-recompenses §4.2, §4.4) ----
  /**
   * Newest waiting level when the screen was closed with "See the map": those offers wait
   * for the badge or the hub, the next completed level opens the screen again.
   */
  let minimizedLevel: number | null = null;
  /** Offer on screen (identity: a forced or re-drawn offer is a new object). */
  let shownOffer: StoredOffer | null = null;
  const offerSeries = new OfferSeries();
  /** Show the first pending offer (drawn now if needed), or close the screen if none. */
  const showOffer = (): void => {
    const offer = ensureOffer(state, world.emit);
    shownOffer = offer;
    if (!offer) {
      offerScreen.close();
      return;
    }
    const position = offerSeries.position(offer.level, state.pendingLevels.length);
    offerScreen.show(offerView(state, offer, position));
    markSeen(state, OFFER_INTRO_ID);
  };
  /** The badge (top bar or hub): open the waiting offer again, whatever was closed. */
  const reopenOffer = (): void => {
    if (!choiceScreen || state.pendingLevels.length === 0 || offerScreen.isOpen) return;
    minimizedLevel = null;
    showOffer();
  };
  /** Whether the screen may open by itself now (§4.4). */
  const offerMayOpen = (): boolean =>
    canOpenOffer({
      newest: state.pendingLevels.at(-1) ?? null,
      minimized: minimizedLevel,
      modal: menu.isOpen || tutorial.isOpen || endScreen.isOpen || (markerEditor?.isOpen ?? false),
      gesture: pointer.pressed || tools.gesturing,
      catchingUp: loop.catchUpProgress !== null,
      tipPending: autoTutorials && pendingTips(state).length > 0,
    });
  /** Every frame: open the screen when allowed, follow the offer while it is open. */
  const syncOffer = (): void => {
    if (!choiceScreen) return;
    if (state.pendingLevels.length === 0) {
      offerSeries.reset();
      minimizedLevel = null;
      shownOffer = null;
      offerScreen.close();
      return;
    }
    if (offerScreen.isOpen) {
      // The offer changed under the screen (debug choice or forced offer): show the new one,
      // unless that choice brought tutorial cards. They come first, as after a click (§4.3).
      if (state.currentOffer === shownOffer) return;
      if (autoTutorials && pendingTips(state).length > 0) offerScreen.close();
      else showOffer();
    } else if (offerMayOpen()) showOffer();
  };
  const offerScreen = new OfferScreen(uiRoot, {
    choose: (index) => {
      if (!chooseCard(state, index, world.emit)) return;
      sfx.cardChosen();
      // Next offer at once, unless the choice brought a tutorial card or the end screen:
      // they come first, and the screen opens again after them.
      if (state.pendingLevels.length > 0 && offerMayOpen()) showOffer();
      else offerScreen.close();
    },
    later: () => {
      minimizedLevel = state.pendingLevels.at(-1) ?? null;
      offerScreen.close();
    },
    flip: () => sfx.cardFlip(),
  });

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
        .catch((e: unknown) => {
          sfx.error();
          const outdated = e instanceof SaveError && e.reason === 'outdated';
          toasts.show(t(outdated ? 'toast.importOutdated' : 'toast.importError'));
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
    replayTip: (tip) => openTutorial(tip),
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
  if (loaded.error === 'outdated') toasts.show(t('toast.loadOutdated'));
  else if (loaded.error) toasts.show(t('toast.loadError'));
  // Soft click on every UI button (PLAN §12), but those with a sound of their own.
  uiRoot.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button:not([data-silent])')) sfx.click();
  });

  world.events.on('levelCompleted', ({ level, reward }) => {
    renderer.waveStart = performance.now();
    sfx.levelComplete();
    // Levels 1 and 2 name their fixed card; later ones get theirs once chosen.
    toasts.show(
      t('toast.levelDone', { n: level }),
      reward ? t('toast.unlocked', { reward: cardLabel(reward) }) : undefined,
    );
  });
  world.events.on('cardChosen', (card) => {
    toasts.show(t('toast.obtained', { reward: cardLabel(card) }));
    // The end screen opens once the offer of the final level is chosen.
    if (card.final) endScreen.show(world.state);
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
      onTool: (tool) => {
        if (tool === 'paste' && !tools.isAvailable('paste')) sfx.error();
        // Ctrl+C / Ctrl+X on a selected zone or building copy it at once.
        else if ((tool === 'copy' || tool === 'cut') && tools.copyTarget) {
          tools.copyTargetRect(tool === 'cut');
        } else tools.setTool(tool);
      },
      onRotate: (delta) => tools.rotate(delta),
      onMirror: () => tools.mirror(),
      onPick: () => tools.pick(),
      onUndo: undo,
      onRedo: redo,
      onCancel: () => {
        const open = panels.find((p) => p.isOpen);
        if (tutorial.isOpen) tutorial.close();
        else if (endScreen.isOpen) endScreen.hide();
        else if (open) open.close();
        else if (tools.tool !== 'none') tools.cancel();
        else if (tools.selection) tools.clearSelection();
        else menu.open();
      },
      onQuickDemolish: () => tools.deletePressed(),
      onTogglePause: togglePause,
    },
    () =>
      menu.isOpen ||
      endScreen.isOpen ||
      tutorial.isOpen ||
      offerScreen.isOpen ||
      (markerEditor?.isOpen ?? false),
  );
  /** A press without a tool that starts and ends on the hub reopens a waiting offer. */
  let hubPress = false;
  const onHub = (x: number, y: number): boolean =>
    x >= HUB.x && x < HUB.x + HUB.size && y >= HUB.y && y < HUB.y + HUB.size;
  const pointer = new PointerInput(canvas, camera, {
    onDown: (x, y, mods) => {
      hubPress = tools.tool === 'none' && onHub(x, y);
      tools.pointerDown(x, y, mods);
    },
    onMove: (x, y, mods) => tools.pointerMove(x, y, mods),
    onUp: (x, y, mods) => {
      tools.pointerUp(x, y, mods);
      if (hubPress && onHub(x, y)) reopenOffer();
      hubPress = false;
    },
    onCancel: () => tools.pointerCancel(),
    onLeave: () => tools.clearHover(),
    // Touch: a tap without a tool selects the object (in `pointerUp`, as a click does). A
    // long press selects it too and lifts a building to move it; with a tool, it picks the
    // object instead (like `E`).
    onLongPress: (x, y) => {
      const done = tools.tool === 'none' ? tools.select(x, y) !== null : tools.pick({ x, y });
      if (!done) return false;
      sfx.click();
      navigator.vibrate?.(10);
      return tools.grabsAt(x, y, true) ? 'grab' : true;
    },
    // Touch: with a tool one finger builds, without one it moves the map, unless it starts
    // on the selected building: then it moves the building.
    buildsOnDrag: (x, y) => tools.tool !== 'none' || tools.grabsAt(x, y, true),
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
  if (debug)
    installDebugApi({ world, camera, loop, tools, saves, perf, effects: renderer.effects });

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
    }
    // While a building is dragged, its ghost shows where it goes.
    const sel = tools.isMoving ? null : tools.selectionRect;
    renderer.selection = sel
      ? { x: sel.x0, y: sel.y0, w: sel.x1 - sel.x0 + 1, h: sel.y1 - sel.y0 + 1 }
      : null;

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
    resolvePending(state, pickMode, world.emit);
    hud.update(world);
    for (const p of panels) p.update();
    topBar.setVisible('upgrades', upgradesAvailable());
    topBar.setReward(choiceScreen && !offerScreen.isOpen ? state.pendingLevels.length : 0);
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
    buildBar.reducedMotion = settings.reduceMotion;
    buildBar.update(now);
    toolActions.update();
    selectionBubble.update();
    showPendingTip();
    syncOffer();
    saves.update();
    statusBar.update(
      saves.lastSavedAt === null ? null : now - saves.lastSavedAt,
      pointer.inside ? hover : null,
    );
    const inspected = pointer.inside ? hover : tools.selectionTile;
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
