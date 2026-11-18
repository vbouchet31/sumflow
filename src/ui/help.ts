import type { MessageKey } from '../i18n';
import { isBuildingUnlocked, isFeatureUnlocked, type GameState } from '../sim/state';
import type { DemoId } from '../tutorial/scenes';

export interface HelpTip {
  id: string;
  title: MessageKey;
  text: MessageKey;
  /** Animated demo of the card; tips without one show `icon` instead. */
  demo?: DemoId;
  icon: string;
  /** The tip is relevant once this holds. */
  when: (s: GameState) => boolean;
}

/** Tutorial cards, in unlock order (PLAN §7.5). */
export const HELP_TIPS: readonly HelpTip[] = [
  {
    id: 'start',
    title: 'help.title.start',
    text: 'help.start',
    demo: 'start',
    icon: '▣',
    when: () => true,
  },
  {
    id: 'adder',
    title: 'tool.adder',
    text: 'help.adder',
    demo: 'adder',
    icon: '+',
    when: (s) => isBuildingUnlocked(s, 'adder'),
  },
  {
    id: 'upgrades',
    title: 'reward.upgrades',
    text: 'help.upgrades',
    icon: '⇧',
    when: (s) => isFeatureUnlocked(s, 'upgrades'),
  },
  {
    id: 'bridge',
    title: 'tool.bridge',
    text: 'help.bridge',
    demo: 'bridge',
    icon: '≡',
    when: (s) => isBuildingUnlocked(s, 'bridge'),
  },
  {
    id: 'multiplier',
    title: 'tool.multiplier',
    text: 'help.multiplier',
    demo: 'multiplier',
    icon: '×',
    when: (s) => isBuildingUnlocked(s, 'multiplier'),
  },
  {
    id: 'priorities',
    title: 'reward.priorities',
    text: 'help.priorities',
    icon: '◆',
    when: (s) => isFeatureUnlocked(s, 'priorities'),
  },
  {
    id: 'subtractor',
    title: 'tool.subtractor',
    text: 'help.subtractor',
    demo: 'subtractor',
    icon: '−',
    when: (s) => isBuildingUnlocked(s, 'subtractor'),
  },
  {
    id: 'divider',
    title: 'tool.divider',
    text: 'help.divider',
    demo: 'divider',
    icon: '÷',
    when: (s) => isBuildingUnlocked(s, 'divider'),
  },
  {
    id: 'exponent',
    title: 'tool.exponent',
    text: 'help.exponent',
    demo: 'exponent',
    icon: '^',
    when: (s) => isBuildingUnlocked(s, 'exponent'),
  },
  {
    id: 'storage',
    title: 'tool.storage',
    text: 'help.storage',
    demo: 'storage',
    icon: '▦',
    when: (s) => isBuildingUnlocked(s, 'storage'),
  },
];

/** Relevant tips not yet dismissed, in order. */
export function pendingTips(state: GameState): HelpTip[] {
  return HELP_TIPS.filter((tip) => tip.when(state) && !state.helpSeen.includes(tip.id));
}

/** The next relevant tip not yet dismissed, or null. */
export function nextTip(state: GameState): HelpTip | null {
  return pendingTips(state)[0] ?? null;
}

/** Tips already relevant (for the Help menu). */
export function knownTips(state: GameState): HelpTip[] {
  return HELP_TIPS.filter((tip) => tip.when(state));
}

/** Mark a tip as seen (stored in the game, `helpSeen`). */
export function markSeen(state: GameState, id: string): void {
  if (!state.helpSeen.includes(id)) state.helpSeen.push(id);
}
