import './ui/styles.css';
import { CAMERA } from './config/keymap';
import { installDebugApi, isDebugEnabled } from './debug/debugApi';
import { detectLocale, getLocale, setLocale } from './i18n';
import { Keyboard } from './input/keyboard';
import { Mouse } from './input/mouse';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { createInitialState } from './sim/state';

/** Longest frame delta honoured for camera motion, in seconds. */
const MAX_FRAME_DT = 0.1;

function bootstrap(): void {
  const canvas = document.getElementById('world');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('Missing #world canvas or #ui-root');
  }

  setLocale(detectLocale(navigator.language));
  document.documentElement.lang = getLocale();

  const state = createInitialState();
  const camera = new Camera();
  const renderer = new Renderer(canvas, camera);
  const keyboard = new Keyboard(window, { onHome: () => camera.centerOn(0, 0) });
  new Mouse(canvas, camera);

  if (isDebugEnabled(location.search)) installDebugApi({ state, camera });

  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    renderer.draw(state);
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - last) / 1000));
    last = now;
    const pan = keyboard.panVector();
    if (pan.dx !== 0 || pan.dy !== 0) {
      const speed = CAMERA.panSpeedPx * (pan.fast ? CAMERA.panShiftFactor : 1) * dt;
      const len = Math.hypot(pan.dx, pan.dy);
      // Keys move the view, so the world moves the opposite way.
      camera.panScreen((-pan.dx / len) * speed, (-pan.dy / len) * speed);
    }
    renderer.draw(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bootstrap();
