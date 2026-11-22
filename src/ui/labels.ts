import { CARDS, type CardDef, type Edition, OFFERS, PASSIVE_EFFECTS } from '../config/cards';
import { getLocale, t } from '../i18n';
import { fixedReward, offerSlots } from '../sim/offers';
import { cardDef, offerContext } from '../sim/rewards';
import type { GameState } from '../sim/state';

/** Placeholders of a card's title and text: its value (`n`) and a passive's percentage. */
export function cardParams(def: CardDef, value?: number): Record<string, string | number> {
  const e = def.effect;
  const pct =
    e.kind === 'passive' ? Math.round((PASSIVE_EFFECTS[e.id].operatorSpeed - 1) * 100) : 0;
  return { n: value ?? '', pct };
}

/** Name of a card, with its value and, for a special building, its native edition. */
export function cardLabel(card: { card: string; edition?: Edition; value?: number }): string {
  const def = cardDef(card.card);
  if (!def) return card.card;
  const e = def.effect;
  const name = t(def.title, cardParams(def, card.value));
  if (e.kind !== 'special' || !card.edition || card.edition === 'base') return name;
  return t('card.withEdition', { name, edition: t(`edition.${card.edition}`) });
}

/** Reward of completing `level`: the fixed card of levels 1 and 2, else "Choice" (N cards). */
export function nextRewardLabel(state: GameState, level: number): string {
  const fixed = fixedReward(level);
  if (fixed) return cardLabel(fixed);
  const n = offerSlots(offerContext(state, level)).length;
  return n > OFFERS.slots.length ? t('reward.choiceCards', { n }) : t('reward.choice');
}

/**
 * The passive cards owned and what they do (PLAN-recompenses §5.3), one line per passive,
 * its copies multiplied: "Opérateurs +5 % : vitesse des opérateurs × 1,05". Empty if none.
 */
export function activeEffects(state: GameState): string[] {
  const lines: string[] = [];
  for (const id of new Set(state.passives)) {
    const n = state.passives.filter((p) => p === id).length;
    const def = CARDS.find((c) => c.effect.kind === 'passive' && c.effect.id === id);
    const name = def ? t(def.title, cardParams(def)) : id;
    const x = (PASSIVE_EFFECTS[id].operatorSpeed ** n).toLocaleString(getLocale(), {
      maximumFractionDigits: 3,
    });
    lines.push(
      t('effects.line', {
        name: n > 1 ? `${name} ×${n}` : name,
        effect: t('effects.operatorSpeed', { x }),
      }),
    );
  }
  return lines;
}

/** "1 h 05 min" / "12 min" from milliseconds. */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? t('time.hm', { h, m: String(m).padStart(2, '0') }) : t('time.m', { m });
}
