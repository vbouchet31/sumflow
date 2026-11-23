import { type MessageKey, t } from '../i18n';
import { el } from './dom';

export type TopAction =
  | 'pause'
  | 'undo'
  | 'redo'
  | 'home'
  | 'marker'
  | 'delivered'
  | 'levels'
  | 'upgrades'
  | 'menu'
  | 'reward';

/** Buttons folded behind the "more" button on a narrow screen. */
const FOLDED: readonly TopAction[] = ['marker', 'delivered', 'levels'];

/** Text symbols (U+FE0E keeps the triangle from turning into an emoji on phones). */
const PAUSE_ICON = '❚❚';
const RESUME_ICON = '▶\uFE0E';

/** Top-right buttons (PLAN §9.1). */
export class TopBar {
  private readonly buttons = new Map<TopAction, HTMLButtonElement>();
  /** "Reward to choose": shown while an offer waits, a press reopens the choice screen. */
  private readonly reward: HTMLButtonElement;
  private readonly rewardLabel = el('span', 'top-reward-label');
  private rewardCount = -1;

  constructor(root: HTMLElement, actions: Record<TopAction, () => void>) {
    const bar = el('nav', 'top-bar');
    const cards = el('span', 'top-reward-icon');
    cards.setAttribute('aria-hidden', 'true');
    this.reward = el('button', 'top-btn top-reward', cards, this.rewardLabel);
    this.reward.type = 'button';
    this.reward.dataset['action'] = 'reward';
    this.reward.hidden = true;
    this.reward.addEventListener('click', (e) => {
      actions.reward();
      if (e.detail > 0) this.reward.blur();
    });
    bar.append(this.reward);
    this.buttons.set('reward', this.reward);
    const folded = el('div', 'top-more');
    const more = el('button', 'top-btn top-more-btn', '⋯');
    const setOpen = (open: boolean): void => {
      bar.classList.toggle('more-open', open);
      more.setAttribute('aria-expanded', String(open));
    };
    more.type = 'button';
    more.title = t('btn.more');
    more.setAttribute('aria-label', t('btn.more'));
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', (e) => {
      setOpen(!bar.classList.contains('more-open'));
      if (e.detail > 0) more.blur();
    });
    // A press anywhere else closes the folded buttons.
    document.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Node && !bar.contains(e.target)) setOpen(false);
    });
    const add = (id: TopAction, label: MessageKey, icon: string): void => {
      const btn = el('button', 'top-btn', icon);
      btn.type = 'button';
      btn.title = t(label);
      btn.setAttribute('aria-label', t(label));
      btn.dataset['action'] = id;
      btn.addEventListener('click', (e) => {
        actions[id]();
        setOpen(false);
        // Mouse clicks give the keyboard back to the game; keyboard users keep their place.
        if (e.detail > 0) btn.blur();
      });
      (FOLDED.includes(id) ? folded : bar).append(btn);
      if (id === 'home') bar.append(folded);
      if (id === 'upgrades') bar.append(more);
      this.buttons.set(id, btn);
    };
    add('pause', 'btn.pause', PAUSE_ICON);
    add('undo', 'btn.undo', '↶');
    add('redo', 'btn.redo', '↷');
    add('home', 'btn.home', '⌂');
    add('marker', 'btn.marker', '⚑');
    add('delivered', 'btn.delivered', '∑');
    add('levels', 'btn.levels', '☰');
    add('upgrades', 'btn.upgrades', '⇧');
    add('menu', 'btn.menu', '⋮');
    root.append(bar);
  }

  setVisible(id: TopAction, visible: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) btn.hidden = !visible;
  }

  setEnabled(id: TopAction, enabled: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) btn.disabled = !enabled;
  }

  /** The pause button shows what a press will do: pause, or resume. */
  setPaused(paused: boolean): void {
    const btn = this.buttons.get('pause');
    if (!btn || btn.getAttribute('aria-pressed') === String(paused)) return;
    const label = t(paused ? 'btn.resume' : 'btn.pause');
    btn.textContent = paused ? RESUME_ICON : PAUSE_ICON;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(paused));
  }

  /** Pressed state (toggle buttons such as the marker tool). */
  setPressed(id: TopAction, pressed: boolean): void {
    this.buttons.get(id)?.setAttribute('aria-pressed', String(pressed));
  }

  /** The "Reward to choose" button, for `pending` offers waiting (hidden at 0). */
  setReward(pending: number): void {
    if (pending === this.rewardCount) return;
    this.rewardCount = pending;
    this.reward.hidden = pending === 0;
    const label = pending > 1 ? t('btn.rewardCount', { n: pending }) : t('btn.reward');
    this.rewardLabel.textContent = label;
    this.reward.title = label;
    this.reward.setAttribute('aria-label', label);
  }

  /** Green badge (an upgrade is ready, PLAN §7.3). */
  setBadge(id: TopAction, on: boolean): void {
    this.buttons.get(id)?.classList.toggle('has-badge', on);
  }
}
