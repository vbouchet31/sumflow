import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import type { World } from '../sim/world';
import { el } from './dom';
import { nextRewardLabel } from './labels';

/** Top-left HUD (PLAN §9.1): level, target, progress, next reward, current target rate. */
export class Hud {
  private readonly level = el('div', 'hud-level');
  private readonly target = el('div', 'hud-target');
  private readonly count = el('div', 'hud-count');
  private readonly bar = el('div', 'hud-bar-fill');
  private readonly rate = el('div', 'hud-rate');
  private readonly reward = el('div', 'hud-reward');
  private readonly barTrack = el('div', 'hud-bar', this.bar);
  /** Covers the compact HUD: a press shows or hides the rate and the next reward. */
  private readonly toggle = el('button', 'hud-toggle');
  private readonly box: HTMLElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.box = el(
      'section',
      'hud',
      this.level,
      this.target,
      this.count,
      this.barTrack,
      this.rate,
      this.reward,
      this.toggle,
    );
    this.barTrack.setAttribute('role', 'progressbar');
    this.barTrack.setAttribute('aria-valuemin', '0');
    this.toggle.type = 'button';
    this.toggle.hidden = true;
    this.toggle.setAttribute('aria-label', t('hud.details'));
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', (e) => {
      const open = this.box.classList.toggle('is-open');
      this.toggle.setAttribute('aria-expanded', String(open));
      if (e.detail > 0) this.toggle.blur();
    });
    root.append(this.box);
  }

  /** Small screens: one line (level, target, count), unfolded by a press. */
  setCompact(compact: boolean): void {
    this.toggle.hidden = !compact;
    if (compact) return;
    this.box.classList.remove('is-open');
    this.toggle.setAttribute('aria-expanded', 'false');
  }

  update(world: World): void {
    const { state } = world;
    const req = state.levelRequirement;
    const loc = getLocale();
    const rate = req ? world.stats.rate(req.value) : 0;
    const key = `${state.level}|${state.picks.length}|${req?.value}|${req?.delivered}|${req?.required}|${rate.toFixed(2)}|${loc}`;
    if (key === this.last) return;
    this.last = key;
    this.level.textContent = t('hud.level', { n: state.level });
    if (!req) {
      this.target.textContent = '';
      this.count.textContent = t('hud.finished');
      this.barTrack.hidden = true;
      this.rate.textContent = '';
      this.reward.textContent = '';
      return;
    }
    this.barTrack.hidden = false;
    this.target.textContent = formatFull(req.value, loc);
    this.count.textContent = `${formatFull(req.delivered, loc)} / ${formatFull(req.required, loc)}`;
    const pct = req.required > 0 ? (100 * req.delivered) / req.required : 100;
    this.bar.style.width = `${Math.min(100, pct)}%`;
    this.barTrack.setAttribute('aria-valuemax', String(req.required));
    this.barTrack.setAttribute('aria-valuenow', String(req.delivered));
    this.rate.textContent = t('hud.rate', {
      rate: rate.toLocaleString(loc, { maximumFractionDigits: 2 }),
    });
    this.reward.textContent = t('hud.nextReward', { reward: nextRewardLabel(state, state.level) });
  }
}
