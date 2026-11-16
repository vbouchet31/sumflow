import './ui/styles.css';
import { detectLocale, getLocale, setLocale } from './i18n';
import { Renderer } from './render/renderer';
import { mountSplash } from './ui/splash';

function bootstrap(): void {
  const canvas = document.getElementById('world');
  const uiRoot = document.getElementById('ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
    throw new Error('Missing #world canvas or #ui-root');
  }

  setLocale(detectLocale(navigator.language));
  document.documentElement.lang = getLocale();

  const renderer = new Renderer(canvas);
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    renderer.draw();
  };
  window.addEventListener('resize', resize);
  resize();

  mountSplash(uiRoot);

  const frame = (): void => {
    renderer.draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bootstrap();
