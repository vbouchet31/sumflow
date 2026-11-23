import { START_MAX_EXTRACTION } from '../config/balance';
import type { Edition, SpecialEdition } from '../config/cards';
import type { MessageKey } from '../i18n';
import { type CardArt, cardArt } from '../render/cardArt';
import { offerSlots } from '../sim/offers';
import { offerContext } from '../sim/rewards';
import { isBuildingUnlocked, isFeatureUnlocked, type GameState } from '../sim/state';
import type { DemoId } from '../tutorial/scenes';

export interface HelpTip {
  id: string;
  title: MessageKey;
  text: MessageKey;
  /** Animated demo of the card; tips without one show `icon` instead. */
  demo?: DemoId;
  icon: string;
  /** Reward card picture shown on the card instead of `icon` (render/cardArt.ts). */
  art?: (s: GameState) => CardArt;
  /** Parameters of `text`, read when the card opens. */
  params?: (s: GameState) => Record<string, string | number>;
  /** The tip is relevant once this holds. */
  when: (s: GameState) => boolean;
}

/** Special buildings obtained, as `[type, edition]` (keys `"type:edition"` of `specials`). */
function ownedSpecials(s: GameState): [string, Edition][] {
  return Object.entries(s.specials).flatMap(([key, n]) => {
    const [type = '', edition = 'base'] = key.split(':');
    return n > 0 ? [[type, edition as Edition] as [string, Edition]] : [];
  });
}

/** An edition card of `edition` obtained, or a special building of that native edition. */
export function ownsEdition(s: GameState, edition: SpecialEdition): boolean {
  return s.editionCards[edition] > 0 || ownedSpecials(s).some(([, e]) => e === edition);
}

/** Tip of an edition: icon only for now (a demo of the Edition tool may come with it). */
function editionTip(edition: SpecialEdition, icon: string): HelpTip {
  return {
    id: `edition.${edition}`,
    title: edition === 'brillante' ? 'card.editionBrillante.title' : 'card.editionLegendaire.title',
    text: edition === 'brillante' ? 'help.edition.brillante' : 'help.edition.legendaire',
    icon,
    art: () => cardArt(`edition:${edition}`, edition),
    when: (s) => ownsEdition(s, edition),
  };
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
    // A value obtained by a card (PLAN-recompenses §4.3). Shows the highest one: on replay
    // the sentence stays true.
    id: 'value',
    title: 'help.title.value',
    text: 'help.value',
    icon: '#',
    art: (s) => cardArt('value', 'base', s.maxExtraction),
    params: (s) => ({ n: s.maxExtraction }),
    when: (s) => s.maxExtraction > START_MAX_EXTRACTION,
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
  // Reward cards (PLAN-recompenses §4.3): after the buildings they apply to.
  {
    id: 'special',
    title: 'help.title.special',
    text: 'help.special',
    icon: '◈',
    art: (s) => {
      const [type, edition] = ownedSpecials(s)[0] ?? ['ancientAdder', 'base'];
      return cardArt(`special:${type}`, edition);
    },
    when: (s) => ownedSpecials(s).length > 0,
  },
  editionTip('brillante', '✦'),
  editionTip('legendaire', '★'),
  {
    id: 'passive',
    title: 'help.title.passive',
    text: 'help.passive',
    icon: '↯',
    art: (s) => cardArt(`passive:${s.passives[0] ?? ''}`, 'base'),
    when: (s) => s.passives.length > 0,
  },
  {
    id: 'eventail',
    title: 'card.eventail.title',
    text: 'help.eventail',
    icon: '❖',
    art: () => cardArt('meta:eventail', 'base'),
    params: (s) => ({ n: offerSlots(offerContext(s, s.level)).length }),
    when: (s) => s.picks.some((p) => p.card === 'eventail'),
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

/** What the card of `tip` shows from the game: its picture and the parameters of its text. */
export function tipContent(
  tip: HelpTip,
  state: GameState,
): { art?: CardArt; params?: Record<string, string | number> } {
  return {
    ...(tip.art ? { art: tip.art(state) } : {}),
    ...(tip.params ? { params: tip.params(state) } : {}),
  };
}

/** Mark a tip as seen (stored in the game, `helpSeen`). */
export function markSeen(state: GameState, id: string): void {
  if (!state.helpSeen.includes(id)) state.helpSeen.push(id);
}
