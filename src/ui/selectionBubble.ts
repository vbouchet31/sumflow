import type { ToolController } from '../build/tools';
import { type MessageKey, t } from '../i18n';
import type { Camera } from '../render/camera';
import { el } from './dom';

type BubbleAction = 'rotate' | 'copy' | 'delete';

interface BubbleDef {
  id: BubbleAction;
  label: MessageKey;
  /** SVG path data, drawn as a 24 × 24 chalk stroke. */
  icon: readonly string[];
  run: (tools: ToolController) => void;
  shown: (tools: ToolController) => boolean;
  danger?: boolean;
}

const ACTIONS: readonly BubbleDef[] = [
  {
    id: 'rotate',
    label: 'act.rotate',
    icon: ['M20 11a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
    run: (tools) => tools.rotate(1),
    shown: (tools) => tools.canRotate,
  },
  {
    id: 'copy',
    label: 'act.copy',
    icon: [
      'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
      'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
    ],
    run: (tools) => tools.copySelection(),
    shown: (tools) => tools.canCopySelection,
  },
  {
    id: 'delete',
    label: 'act.delete',
    icon: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    run: (tools) => tools.deleteSelection(),
    shown: (tools) => tools.canDeleteSelection,
    danger: true,
  },
];

const SVG = 'http://www.w3.org/2000/svg';

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Space kept between the bubble and the building, and from the screen edges. */
const GAP = 12;
const MARGIN = 8;

/**
 * Floating bubble next to the selected building: rotate, copy, delete. Drawn above the
 * building, or below it when there is no room; kept inside the screen and clear of the
 * bars at the bottom. It follows the camera every frame. Belts and bridges have none:
 * their actions stay in the action bar.
 */
export class SelectionBubble {
  private readonly box = el('div', 'sel-bubble');
  private readonly buttons = new Map<BubbleAction, HTMLButtonElement>();
  private last = '';
  private size = { w: 0, h: 0 };
  /** Lowest y the bubble may reach (top of the bars at the bottom), measured on show. */
  private floor = 0;
  private pos = '';

  constructor(
    root: HTMLElement,
    private readonly tools: ToolController,
    private readonly camera: Camera,
  ) {
    this.box.setAttribute('role', 'toolbar');
    this.box.setAttribute('aria-label', t('act.bubble'));
    for (const def of ACTIONS) {
      if (def.id === 'delete') this.box.append(el('span', 'sel-bubble-sep'));
      const btn = el(
        'button',
        'sel-bubble-btn',
        icon(def.icon),
        el('span', undefined, t(def.label)),
      );
      btn.type = 'button';
      btn.dataset['action'] = def.id;
      if (def.danger) btn.classList.add('sel-bubble-danger');
      btn.title = t(`${def.label}Title` as MessageKey);
      btn.addEventListener('click', (e) => {
        def.run(tools);
        // Mouse clicks give the keyboard back to the game; keyboard users keep their place.
        if (e.detail > 0) btn.blur();
      });
      this.box.append(btn);
      this.buttons.set(def.id, btn);
    }
    this.box.hidden = true;
    root.append(this.box);
    window.addEventListener('resize', () => (this.last = ''));
  }

  private hide(): void {
    if (!this.box.hidden) this.box.hidden = true;
    this.last = '';
  }

  /** Cheap: call every frame. Measures only when the content changes. */
  update(): void {
    const { tools, camera } = this;
    const b = tools.tool === 'none' && !tools.isMoving ? tools.selectedBuilding : null;
    const rect = b ? tools.selectionRect : null;
    if (!b || !rect) return this.hide();
    const shown = ACTIONS.map((def) => def.shown(tools));
    if (!shown.some(Boolean)) return this.hide();

    const key = `${b.id}|${shown.join()}`;
    if (key !== this.last) {
      this.last = key;
      ACTIONS.forEach((def, i) => {
        const btn = this.buttons.get(def.id);
        if (btn) btn.hidden = !shown[i];
      });
      this.box.hidden = false;
      // Replay the entrance when another building is selected.
      this.box.classList.remove('sel-bubble-in');
      void this.box.offsetWidth;
      this.box.classList.add('sel-bubble-in');
      this.size = { w: this.box.offsetWidth, h: this.box.offsetHeight };
      this.floor = this.measureFloor();
      this.pos = '';
    }

    const a = camera.worldToScreen(rect.x0, rect.y0);
    const z = camera.worldToScreen(rect.x1 + 1, rect.y1 + 1);
    const { w, h } = this.size;
    const viewW = camera.viewW;
    // The building left the screen: nothing to point at.
    if (z.x < 0 || a.x > viewW || z.y < 0 || a.y > this.floor) {
      this.box.style.visibility = 'hidden';
      this.pos = '';
      return;
    }
    const cx = (a.x + z.x) / 2;
    const fitsAbove = a.y - GAP - h >= MARGIN;
    const fitsBelow = z.y + GAP + h <= this.floor;
    const above = fitsAbove || !fitsBelow;
    const top = above ? Math.max(MARGIN, a.y - GAP - h) : z.y + GAP;
    const left = Math.max(MARGIN, Math.min(viewW - MARGIN - w, cx - w / 2));
    const arrow = Math.max(14, Math.min(w - 14, cx - left));
    const pos = `${Math.round(left)}|${Math.round(top)}|${Math.round(arrow)}|${above}`;
    if (pos === this.pos) return;
    this.pos = pos;
    this.box.style.visibility = '';
    this.box.style.left = `${Math.round(left)}px`;
    this.box.style.top = `${Math.round(top)}px`;
    this.box.style.setProperty('--arrow-x', `${Math.round(arrow)}px`);
    this.box.classList.toggle('sel-bubble-below', !above);
  }

  /** Top of whatever sits at the bottom of the screen (build bar, action bar). */
  private measureFloor(): number {
    let floor = this.camera.viewH - MARGIN;
    for (const sel of ['.build-bar', '.tool-hint']) {
      const node = document.querySelector(sel);
      if (!(node instanceof HTMLElement) || node.hidden) continue;
      const r = node.getBoundingClientRect();
      if (r.height > 0) floor = Math.min(floor, r.top - MARGIN);
    }
    return floor;
  }
}
