import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/i18n';
import { drawOffer } from '../../src/sim/offers';
import { completeLevel } from '../../src/sim/progression';
import { offerContext } from '../../src/sim/rewards';
import { createInitialState } from '../../src/sim/state';
import { nextOfferLevel, weightRows } from '../../src/ui/debugPanel';
import { picksRecap } from '../../src/ui/endScreen';
import { activeEffects, levelRewardLabel } from '../../src/ui/labels';

afterEach(() => setLocale('fr'));

describe('end screen: "Tes choix" (PLAN-recompenses §4.6, PLAN-paliers §4.3)', () => {
  it('lists the picks in order: the level for a reward, level and palier for a choice', () => {
    const s = createInitialState(42);
    completeLevel(s);
    completeLevel(s);
    s.picks.push(
      { level: 3, card: 'value', edition: 'base', value: 2, tick: 0 },
      { level: 4, palier: 1, card: 'concat', edition: 'legendaire', tick: 0 },
      { level: 5, palier: 2, card: 'edition-brillante', edition: 'brillante', tick: 0 },
      { level: 0, card: 'edition-legendaire', edition: 'legendaire', tick: 0 },
    );
    expect(picksRecap(s)).toEqual([
      { level: 'Niv. 1', card: 'Additionneur' },
      { level: 'Niv. 2', card: 'Améliorations' },
      { level: 'Niv. 3', card: 'Valeur 2' },
      { level: 'Niv. 4 · palier 1', card: 'Concaténateur (légendaire)' },
      { level: 'Niv. 5 · palier 2', card: 'Édition brillante' },
      { level: 'Hors offre', card: 'Édition légendaire' },
    ]);
    setLocale('en');
    expect(picksRecap(s)[3]).toEqual({
      level: 'Lv. 4 · milestone 1',
      card: 'Concatenator (legendary)',
    });
  });
});

describe('Levels panel: the reward of each level (PLAN-paliers §4.3)', () => {
  it('its fil rouge card, and the number of choices of its paliers', () => {
    const s = createInitialState(42);
    expect(levelRewardLabel(s, 1)).toBe('Additionneur');
    expect(levelRewardLabel(s, 3)).toBe('Valeur 2');
    expect(levelRewardLabel(s, 6)).toBe('Valeur 4 · 1 choix');
    expect(levelRewardLabel(s, 7)).toBe('Multiplicateur · 1 choix');
    expect(levelRewardLabel(s, 13)).toBe('Soustracteur · 2 choix');
    expect(levelRewardLabel(s, 16)).toBe('Diviseur · 3 choix');
    setLocale('en');
    expect(levelRewardLabel(s, 6)).toBe('Value 4 · 1 choice');
    expect(levelRewardLabel(s, 16)).toBe('Divider · 3 choices');
  });
});

describe('active effects (passive cards)', () => {
  it('nothing without a passive; one line per passive, copies multiplied', () => {
    const s = createInitialState(1);
    expect(activeEffects(s)).toEqual([]);
    // No passive card for now (PLAN-paliers, P6): the line falls back on the effect id.
    s.passives.push('operatorsBoost');
    expect(activeEffects(s)).toEqual(['operatorsBoost : vitesse des opérateurs × 1,05']);
    s.passives.push('operatorsBoost');
    setLocale('en');
    expect(activeEffects(s)).toEqual(['operatorsBoost ×2: operator speed × 1.103']);
  });
});

describe('debug weights table (PLAN-recompenses §5.4)', () => {
  it('next offer level, and per card probabilities that sum to 1', () => {
    const s = createInitialState(42);
    expect(nextOfferLevel(s)).toBe(6); // the first palier (PLAN-paliers §3.2)
    s.level = 9;
    expect(nextOfferLevel(s)).toBe(9);
    s.pendingOffers = [
      { level: 7, palier: 1 },
      { level: 8, palier: 1 },
    ];
    expect(nextOfferLevel(s)).toBe(7);
    const draws = drawOffer(offerContext(s, 7, 1)).draws;
    expect(draws).toHaveLength(2);
    for (const draw of draws) {
      const rows = weightRows(draw);
      expect(rows.length).toBe(draw.weights.length);
      expect(rows.reduce((n, r) => n + r.probability, 0)).toBeCloseTo(1, 10);
      for (const r of rows) expect(r.guard).toBeGreaterThan(0);
      expect(rows.map((r) => r.card)).toContain(draw.card.card);
    }
  });
});
