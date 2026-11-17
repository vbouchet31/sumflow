import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import type { Camera } from '../render/camera';
import { buildingSize } from '../sim/entities';
import type { World } from '../sim/world';
import { type Deposit, isExtractable } from '../world/deposits';
import { el } from './dom';

/** Screen margins kept free for the HUD, the top bar and the build bar (CSS pixels). */
const MARGIN = { top: 70, right: 28, bottom: 120, left: 28 };

interface Pointer {
  btn: HTMLButtonElement;
  arrow: HTMLElement;
  label: HTMLElement;
  /** Centre of the chip on screen, while shown. */
  pos?: { x: number; y: number };
}

/**
 * Off-screen pointers (PLAN §9.1): when the hub, or the nearest deposit of the number the
 * hub asks for, is outside the view, a chip on the screen edge points at it with its
 * distance. A press glides the camera there.
 */
export class Compass {
  private readonly hub: Pointer;
  private readonly deposit: Pointer;
  private target: Deposit | null = null;
  private targetKey = '';

  constructor(
    root: HTMLElement,
    private readonly fly: (x: number, y: number) => void,
  ) {
    const box = el('div', 'compass');
    this.hub = this.make('hub', t('compass.hub'));
    this.deposit = this.make('deposit', t('compass.deposit'));
    box.append(this.hub.btn, this.deposit.btn);
    root.append(box);
  }

  private make(kind: string, title: string): Pointer {
    const arrow = el('span', 'compass-arrow', '➤︎');
    arrow.setAttribute('aria-hidden', 'true');
    const label = el('span', 'compass-label');
    const btn = el('button', `compass-chip compass-${kind}`, arrow, label);
    btn.type = 'button';
    btn.title = title;
    btn.hidden = true;
    btn.addEventListener('click', (e) => {
      const to = btn.dataset['to']?.split(',').map(Number);
      if (to && to.length === 2) this.fly(to[0] as number, to[1] as number);
      if (e.detail > 0) btn.blur();
    });
    return { btn, arrow, label };
  }

  /** Nearest deposit of the hub's number while it can be extracted (cached per number). */
  private wanted(world: World): Deposit | null {
    const req = world.state.levelRequirement;
    const value = req && isExtractable(req.value, world.state.maxExtraction) ? req.value : null;
    const k = `${value}`;
    if (k !== this.targetKey) {
      this.targetKey = k;
      this.target = value === null ? null : world.deposits.findNearest(value, 8);
    }
    return this.target;
  }

  /** Cheap enough for every frame. */
  update(world: World, cam: Camera): void {
    const hub = world.state.buildings.get(0);
    if (hub) {
      const size = buildingSize(hub.type, hub.rot);
      this.place(this.hub, cam, hub.x + size.w / 2, hub.y + size.h / 2, '⌂');
    }
    const d = this.wanted(world);
    if (d) this.place(this.deposit, cam, d.x + 0.5, d.y + 0.5, formatFull(d.value, getLocale()));
    else this.deposit.btn.hidden = true;
    // Both on the same stretch of edge: the deposit chip moves aside.
    const a = this.hub.pos;
    const b = this.deposit.pos;
    if (!this.hub.btn.hidden && !this.deposit.btn.hidden && a && b) {
      const w = (this.hub.btn.offsetWidth + this.deposit.btn.offsetWidth) / 2 + 6;
      const h = (this.hub.btn.offsetHeight + this.deposit.btn.offsetHeight) / 2 + 6;
      if (Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h) {
        const down = a.y < cam.viewH / 2;
        this.move(this.deposit, b.x, a.y + (down ? h : -h), cam);
      }
    }
  }

  /** Put a chip's centre at `(x, y)`, kept whole inside the free area. */
  private move(p: Pointer, x: number, y: number, cam: Camera): void {
    const hw = p.btn.offsetWidth / 2;
    const hh = p.btn.offsetHeight / 2;
    const cx = Math.min(cam.viewW - MARGIN.right / 2 - hw, Math.max(MARGIN.left / 2 + hw, x));
    const cy = Math.min(cam.viewH - MARGIN.bottom - hh, Math.max(MARGIN.top + hh, y));
    p.pos = { x: cx, y: cy };
    p.btn.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  }

  private place(p: Pointer, cam: Camera, wx: number, wy: number, name: string): void {
    const s = cam.worldToScreen(wx, wy);
    const w = cam.viewW;
    const h = cam.viewH;
    const inside = s.x >= 0 && s.y >= 0 && s.x <= w && s.y <= h;
    p.btn.hidden = inside;
    if (inside) return;
    // Where the line from the screen centre to the target leaves the free area.
    const cx = w / 2;
    const cy = h / 2;
    const dx = s.x - cx;
    const dy = s.y - cy;
    const kx = dx > 0 ? (w - MARGIN.right - cx) / dx : dx < 0 ? (MARGIN.left - cx) / dx : Infinity;
    const ky = dy > 0 ? (h - MARGIN.bottom - cy) / dy : dy < 0 ? (MARGIN.top - cy) / dy : Infinity;
    const k = Math.max(0, Math.min(kx, ky));
    p.arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    const dist = Math.round(Math.hypot(wx - cam.x, wy - cam.y));
    const text = `${name} · ${t('compass.tiles', { n: formatFull(dist, getLocale()) })}`;
    if (p.label.textContent !== text) p.label.textContent = text;
    p.btn.dataset['to'] = `${wx},${wy}`;
    this.move(p, cx + dx * k, cy + dy * k, cam);
  }
}
