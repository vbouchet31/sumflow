import type { Ghost } from '../build/tools';
import { type MessageKey, t } from '../i18n';
import { el } from './dom';

/** Parts of the label: text and tone. */
type Part = { text: string; tone: 'ok' | 'warn' | 'bad' | 'info' };

/** "1 bridge" or "3 bridges". */
function count(n: number, one: MessageKey, many: MessageKey): string {
  return n === 1 ? t(one) : t(many, { n });
}

/** What a ghost will do, in a few words ("12 belts · 2 bridges · 1 blocked"). Empty: nothing to say. */
export function describeGhost(ghost: Ghost): Part[] {
  const parts: Part[] = [];
  if (ghost.area) {
    const { rect } = ghost.area;
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    if (w * h > 1) parts.push({ text: t('hint.areaSize', { w, h }), tone: 'info' });
    return parts;
  }
  if (ghost.belts.length > 1) {
    let belts = 0;
    let bridges = 0;
    let replaced = 0;
    let blocked = 0;
    for (const b of ghost.belts) {
      if (b.status === 'blocked') blocked++;
      else if (b.status === 'bridge') bridges++;
      else {
        belts++;
        if (b.status === 'replace') replaced++;
      }
    }
    if (belts > 0) parts.push({ text: count(belts, 'label.belt', 'label.belts'), tone: 'ok' });
    if (bridges > 0)
      parts.push({ text: count(bridges, 'label.bridge', 'label.bridges'), tone: 'info' });
    if (replaced > 0)
      parts.push({ text: count(replaced, 'label.replacedOne', 'label.replaced'), tone: 'warn' });
    if (blocked > 0)
      parts.push({ text: count(blocked, 'label.blockedOne', 'label.blocked'), tone: 'bad' });
    return parts;
  }
  if (ghost.buildings.length > 1) {
    const ok = ghost.buildings.filter((b) => b.ok).length;
    const blocked = ghost.buildings.length - ok;
    if (ok > 0) parts.push({ text: t('label.buildings', { n: ok }), tone: 'ok' });
    if (blocked > 0)
      parts.push({ text: count(blocked, 'label.blockedOne', 'label.blocked'), tone: 'bad' });
  }
  return parts;
}

/**
 * Small label that follows the pointer (or floats above the finger) while a drag builds
 * several things: how many belts, bridges, replaced or blocked tiles, or the size of a zone.
 */
export class CursorLabel {
  private readonly box = el('div', 'cursor-label');
  private last = '';

  constructor(root: HTMLElement) {
    this.box.setAttribute('aria-hidden', 'true');
    this.box.hidden = true;
    root.append(this.box);
  }

  /**
   * `at`: pointer position (CSS pixels); `touch`: it is a finger, so the label goes above it.
   * Null hides the label.
   */
  update(ghost: Ghost, at: { x: number; y: number } | null, touch: boolean, viewW: number): void {
    const parts = at ? describeGhost(ghost) : [];
    if (!at || parts.length === 0) {
      this.box.hidden = true;
      this.last = '';
      return;
    }
    const key = parts.map((p) => `${p.tone}:${p.text}`).join('|');
    if (key !== this.last) {
      this.last = key;
      this.box.replaceChildren(
        ...parts.map((p, i) => {
          const span = el('span', `cl-part cl-${p.tone}`, p.text);
          return i === 0 ? span : el('span', 'cl-sep', '·', span);
        }),
      );
    }
    this.box.hidden = false;
    const w = this.box.offsetWidth;
    const h = this.box.offsetHeight;
    let x = touch ? at.x - w / 2 : at.x + 18;
    let y = touch ? at.y - h - 64 : at.y + 20;
    if (x + w > viewW - 8) x = at.x - w - 12;
    x = Math.max(8, x);
    if (y < 8) y = at.y + 64;
    this.box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
}
