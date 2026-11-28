import { describe, expect, it } from 'vitest';
import { LEVEL_TABLE } from '../../src/config/balance';
import { CARDS, type CardEffect } from '../../src/config/cards';
import { cardArt } from '../../src/render/cardArt';
import { autoPickIndex } from '../../src/sim/autoPick';
import { paliersFor } from '../../src/sim/levels';
import { chooseCard, completeLevel, deliver, ensureOffer } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';
import { HELP_TIPS } from '../../src/ui/help';

/**
 * End of phase 1 (PLAN-recompenses §5.7). The unlock order of the natural cards is checked
 * level by level in offers.test.ts; here a whole game is played with the real offers.
 */
describe('phase 1 is complete', () => {
  it('a game plays to the end: each level gives its fil rouge, each palier an offer', () => {
    for (const seed of [1, 42, 2024]) {
      const s = createInitialState(seed);
      let offers = 0;
      for (let i = 0; i < 5000 && s.finishedAtTick === null; i++) {
        const level = s.level;
        const req = s.levelRequirement;
        if (!req) break;
        if (level <= 20) {
          // Real deliveries: the paliers queue their offers on the way.
          while (s.level === level && s.finishedAtTick === null) deliver(s, req.value);
        } else {
          paliersFor(level).forEach((_, k) => s.pendingOffers.push({ level, palier: k + 1 }));
          completeLevel(s);
        }
        for (let offer = ensureOffer(s); offer; offer = ensureOffer(s)) {
          offers++;
          expect(chooseCard(s, autoPickIndex(s, offer, 'first') ?? 0)).toBe(true);
        }
      }
      expect(s.finishedAtTick).not.toBeNull();
      expect(s.pendingOffers).toEqual([]);
      // One card per level and one per palier; every reward of the table was obtained.
      const paliers = s.levels.reduce((n, _, k) => n + paliersFor(k + 1).length, 0);
      expect(offers).toBe(paliers);
      expect(s.picks).toHaveLength(s.levels.length + paliers);
      for (const def of LEVEL_TABLE) {
        const r = def.reward;
        if (r.kind === 'building') expect(s.unlockedBuildings).toContain(r.building);
        if (r.kind === 'feature') expect(s.unlockedFeatures).toContain(r.feature);
      }
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
