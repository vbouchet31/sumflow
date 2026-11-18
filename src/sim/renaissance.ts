import { RENAISSANCE } from '../config/balance';
import type { GameState } from './state';

/** Speed multiplier earned by past renaissances (proposal 17). */
export function renaissanceFactor(state: GameState): number {
  return 1 + RENAISSANCE.bonus * state.renaissance;
}

/** Can the player be reborn now? */
export function canBeReborn(state: GameState): boolean {
  return state.level >= RENAISSANCE.fromLevel || state.finishedAtTick !== null;
}

/** Roman numeral for the badge (I, II, … up to 3999). */
export function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}
