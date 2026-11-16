import { t } from '../i18n';

/** Temporary M0 title overlay, replaced by the HUD in later milestones. */
export function mountSplash(root: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'splash';
  const title = document.createElement('h1');
  title.textContent = t('app.title');
  const tagline = document.createElement('p');
  tagline.textContent = t('app.tagline');
  el.append(title, tagline);
  root.append(el);
  return el;
}
