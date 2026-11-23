import { describe, expect, it } from 'vitest';
import { LEVEL_TABLE } from '../../src/config/balance';
import { CARDS, type CardEffect } from '../../src/config/cards';
import { cardArt } from '../../src/render/cardArt';
import { autoPickIndex } from '../../src/sim/autoPick';
import { naturalAt } from '../../src/sim/offers';
import { chooseCard, completeLevel, ensureOffer } from '../../src/sim/progression';
import { offerContext } from '../../src/sim/rewards';
import { createInitialState } from '../../src/sim/state';
import { HELP_TIPS } from '../../src/ui/help';

/**
 * End of phase 1 (PLAN-recompenses §5.7). The unlock order of the natural cards is checked
 * level by level in offers.test.ts; here a whole game is played with the real offers.
 */
describe('phase 1 is complete', () => {
  it('a game plays from level 1 to the end taking the natural card whenever offered', () => {
    for (const seed of [1, 42, 2024]) {
      const s = createInitialState(seed);
      let offers = 0;
      let natural = 0;
      for (let i = 0; i < 5000 && s.finishedAtTick === null; i++) {
        completeLevel(s);
        for (let offer = ensureOffer(s); offer; offer = ensureOffer(s)) {
          offers++;
          const want = naturalAt(offerContext(s, offer.level)).card;
          if (offer.cards.some((c) => c.card === want)) natural++;
          expect(chooseCard(s, autoPickIndex(s, offer, 'natural') ?? 0)).toBe(true);
        }
      }
      expect(s.finishedAtTick).not.toBeNull();
      expect(s.pendingLevels).toEqual([]);
      // One card per level; every reward of the current table was obtained.
      expect(s.picks).toHaveLength(s.levels.length);
      for (const def of LEVEL_TABLE) {
        const r = def.reward;
        if (r.kind === 'building') expect(s.unlockedBuildings).toContain(r.building);
        if (r.kind === 'feature') expect(s.unlockedFeatures).toContain(r.feature);
      }
      // The natural card is in most offers (its boosted weight).
      expect(natural / offers).toBeGreaterThan(0.6);
    }
  });

  it('every kind of card exists, with a picture and a help tip', () => {
    const kinds: CardEffect['kind'][] = [
      'value',
      'unlock',
      'special',
      'edition',
      'passive',
      'meta',
    ];
    for (const kind of kinds) {
      const cards = CARDS.filter((c) => c.effect.kind === kind);
      expect(cards.length, kind).toBeGreaterThan(0);
      for (const c of cards) {
        expect(cardArt(c.icon, 'base', 5).kind, c.id).not.toBe('unknown');
        expect(
          HELP_TIPS.some((tip) => tip.id === c.tip),
          c.id,
        ).toBe(true);
      }
    }
  });
});
