import { type MessageKey, t } from '../i18n';
import { isBuildingUnlocked, isFeatureUnlocked, type GameState } from '../sim/state';
import { el } from './dom';

export interface HelpTip {
  id: string;
  text: MessageKey;
  /** The tip is relevant once this holds. */
  when: (s: GameState) => boolean;
}

/** Contextual help bubbles, in order (PLAN §7.5). */
export const HELP_TIPS: readonly HelpTip[] = [
  { id: 'start', text: 'help.start', when: () => true },
  { id: 'adder', text: 'help.adder', when: (s) => isBuildingUnlocked(s, 'adder') },
  { id: 'upgrades', text: 'help.upgrades', when: (s) => isFeatureUnlocked(s, 'upgrades') },
  { id: 'bridge', text: 'help.bridge', when: (s) => isBuildingUnlocked(s, 'bridge') },
  { id: 'priorities', text: 'help.priorities', when: (s) => isFeatureUnlocked(s, 'priorities') },
  { id: 'subtractor', text: 'help.subtractor', when: (s) => isBuildingUnlocked(s, 'subtractor') },
  { id: 'divider', text: 'help.divider', when: (s) => isBuildingUnlocked(s, 'divider') },
  { id: 'exponent', text: 'help.exponent', when: (s) => isBuildingUnlocked(s, 'exponent') },
  { id: 'streak', text: 'help.streak', when: (s) => s.streak.count >= 10 },
  { id: 'storage', text: 'help.storage', when: (s) => isBuildingUnlocked(s, 'storage') },
];

/** The next relevant tip not yet dismissed, or null. */
export function nextTip(state: GameState): HelpTip | null {
  return HELP_TIPS.find((tip) => tip.when(state) && !state.helpSeen.includes(tip.id)) ?? null;
}

/** Tips already relevant (for the Help menu). */
export function knownTips(state: GameState): HelpTip[] {
  return HELP_TIPS.filter((tip) => tip.when(state));
}

/**
 * Non-blocking help bubble (PLAN §7.5): one at a time, dismissed with its button; the
 * next relevant tip follows. Dismissed tips are stored in the game (`helpSeen`).
 */
export class HelpBubble {
  private readonly box = el('aside', 'help-bubble');
  private readonly text = el('p');
  /** Tip on screen; `undefined` forces a refresh. */
  private current: string | null | undefined = undefined;

  constructor(
    root: HTMLElement,
    private readonly state: GameState,
  ) {
    const ok = el('button', 'secondary-btn', t('help.dismiss'));
    ok.type = 'button';
    ok.addEventListener('click', () => this.dismiss());
    this.box.setAttribute('role', 'note');
    this.box.setAttribute('aria-label', t('help.label'));
    this.box.append(el('span', 'help-icon', '?'), this.text, ok);
    this.box.hidden = true;
    root.append(this.box);
  }

  dismiss(): void {
    if (this.current && !this.state.helpSeen.includes(this.current)) {
      this.state.helpSeen.push(this.current);
    }
    this.current = undefined;
    this.update();
  }

  /** Show the next pending tip, if any. Cheap: call every frame. */
  update(): void {
    const tip = nextTip(this.state);
    const id = tip?.id ?? null;
    if (id === this.current) return;
    this.current = id;
    this.box.hidden = tip === null;
    if (tip) this.text.textContent = t(tip.text);
  }
}
