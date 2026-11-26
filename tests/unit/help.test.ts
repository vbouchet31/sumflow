import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards';
import { en } from '../../src/i18n/en';
import { fr } from '../../src/i18n/fr';
import { chooseCard, completeLevel, ensureOffer, setLevel } from '../../src/sim/progression';
import { grantCard } from '../../src/sim/rewards';
import { createInitialState, type GameState } from '../../src/sim/state';
import { HELP_TIPS, type HelpTip, knownTips, pendingTips, tipContent } from '../../src/ui/help';
import { OFFER_INTRO_ID } from '../../src/ui/offerInfo';

/** Tips added with the reward choice (PLAN-recompenses §4.3). */
const REWARD_TIPS = [
  'value',
  'special',
  'edition.brillante',
  'edition.legendaire',
  'passive',
  'eventail',
];

function tip(id: string): HelpTip {
  const found = HELP_TIPS.find((t) => t.id === id);
  if (!found) throw new Error(`no tip ${id}`);
  return found;
}

const fresh = (): GameState => createInitialState(42);

describe('reward tips (PLAN-recompenses §4.3)', () => {
  it('none is pending, nor known, on a fresh game', () => {
    const s = fresh();
    const pending = pendingTips(s).map((t) => t.id);
    expect(pending).toEqual(['start']);
    for (const id of REWARD_TIPS) expect(tip(id).when(s)).toBe(false);
    expect(knownTips(s).map((t) => t.id)).toEqual(['start']);
  });

  it('value: once a card gives a value beyond the start one', () => {
    const s = fresh();
    expect(tip('value').when(s)).toBe(false);
    grantCard(s, 'value');
    expect(s.maxExtraction).toBe(2);
    expect(tip('value').when(s)).toBe(true);
    expect(tipContent(tip('value'), s)).toEqual({
      art: { kind: 'value', value: 2 },
      params: { n: 2 },
    });
  });

  it('editions: an edition card, or a special building of that native edition', () => {
    const shiny = tip('edition.brillante');
    const legendary = tip('edition.legendaire');
    const a = fresh();
    grantCard(a, 'edition-brillante');
    expect(shiny.when(a)).toBe(true);
    expect(legendary.when(a)).toBe(false);

    const b = fresh();
    grantCard(b, 'concat', 'legendaire');
    expect(legendary.when(b)).toBe(true);
    expect(shiny.when(b)).toBe(false);

    // A base special building brings no edition tip.
    const c = fresh();
    grantCard(c, 'concat');
    expect(shiny.when(c)).toBe(false);
    expect(legendary.when(c)).toBe(false);
    // A count back to 0 does not count as owned.
    c.specials['concat:brillante'] = 0;
    expect(shiny.when(c)).toBe(false);
  });

  it('special: the first special building, drawn in its edition', () => {
    const s = fresh();
    expect(tip('special').when(s)).toBe(false);
    grantCard(s, 'concat', 'brillante');
    expect(tip('special').when(s)).toBe(true);
    expect(tipContent(tip('special'), s).art).toEqual({
      kind: 'building',
      tool: 'concat',
      edition: 'brillante',
    });
    // The building's own tip, then the special tip, then the tip of its edition.
    expect(pendingTips(s).map((t) => t.id)).toEqual([
      'start',
      'concat',
      'special',
      'edition.brillante',
    ]);
  });

  it('concat: once a Concaténateur is owned, drawn as a base one', () => {
    const s = fresh();
    expect(tip('concat').when(s)).toBe(false);
    grantCard(s, 'concat', 'legendaire');
    expect(tip('concat').when(s)).toBe(true);
    expect(tipContent(tip('concat'), s).art).toEqual({
      kind: 'building',
      tool: 'concat',
      edition: 'base',
    });
  });

  it('passive: the first passive card', () => {
    const s = fresh();
    expect(tip('passive').when(s)).toBe(false);
    grantCard(s, 'passive-operators');
    expect(tip('passive').when(s)).toBe(true);
    expect(tipContent(tip('passive'), s).art).toEqual({ kind: 'passive' });
  });

  it('eventail: once picked, with the new number of cards', () => {
    const s = fresh();
    expect(tip('eventail').when(s)).toBe(false);
    grantCard(s, 'edition-brillante');
    expect(tip('eventail').when(s)).toBe(false);
    grantCard(s, 'eventail');
    expect(tip('eventail').when(s)).toBe(true);
    expect(tipContent(tip('eventail'), s).params).toEqual({ n: 3 });
  });

  it('a choice brings its tip once: a second value brings nothing new', () => {
    const s = fresh();
    setLevel(s, 3);
    for (const t of pendingTips(s)) s.helpSeen.push(t.id);
    completeLevel(s);
    const offer = ensureOffer(s);
    const index = offer?.cards.findIndex((c) => c.card === 'value') ?? -1;
    expect(index).toBeGreaterThanOrEqual(0);
    expect(chooseCard(s, index)).toBe(true);
    expect(pendingTips(s).map((t) => t.id)).toEqual(['value']);
    s.helpSeen.push('value');
    grantCard(s, 'value');
    expect(pendingTips(s)).toEqual([]);
  });

  it('follow the tip of the building they relate to', () => {
    const ids = HELP_TIPS.map((t) => t.id);
    expect(ids.indexOf('value')).toBeGreaterThan(ids.indexOf('start'));
    // Every special building behaves like an operator: its tip comes after theirs.
    expect(ids.indexOf('special')).toBeGreaterThan(ids.indexOf('storage'));
    expect(ids.indexOf('edition.brillante')).toBeGreaterThan(ids.indexOf('special'));
    expect(ids.indexOf('edition.legendaire')).toBeGreaterThan(ids.indexOf('edition.brillante'));
  });

  it('the offer screen intro line is never a tip of the Help menu', () => {
    const s = fresh();
    s.helpSeen.push(OFFER_INTRO_ID);
    expect(knownTips(s).map((t) => t.id)).not.toContain(OFFER_INTRO_ID);
    expect(pendingTips(s).map((t) => t.id)).not.toContain(OFFER_INTRO_ID);
  });

  it('tip ids are unique, and every card tip names one', () => {
    const ids = HELP_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of CARDS) if (card.tip) expect(ids).toContain(card.tip);
  });

  it('texts with a parameter get it in both languages', () => {
    for (const t of HELP_TIPS) {
      if (!t.params) continue;
      const names = Object.keys(t.params(createInitialState(1)));
      for (const name of names) {
        expect(fr[t.text]).toContain(`{${name}}`);
        expect(en[t.text]).toContain(`{${name}}`);
      }
    }
  });
});
