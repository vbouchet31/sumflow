import { describe, expect, it } from 'vitest';
import { History } from '../../src/build/history';
import { setLocale } from '../../src/i18n';
import { dirMask } from '../../src/sim/entities';
import { changeArea, summarizeChange } from '../../src/ui/changeSummary';
import { makeWorld } from './helpers/scenario';

describe('undo summary', () => {
  it('counts what an action added, removed and changed, and where', () => {
    setLocale('en');
    const world = makeWorld();
    const history = new History(world);
    history.run(() => {
      world.setBelt(30, 30, dirMask(1));
      world.setBelt(31, 30, dirMask(1));
    });
    history.run(() => {
      world.removeBelt(30, 30);
      world.setBelt(31, 30, dirMask(2));
      world.setBelt(32, 30, dirMask(1));
    });
    const change = history.peekUndo();
    if (!change) throw new Error('no change');
    expect(summarizeChange(change)).toBe('Belt +1, Belt −1, 1 changed');
    expect(changeArea(change).bounds).toEqual({ x0: 30, y0: 30, x1: 32, y1: 30 });
  });
});
