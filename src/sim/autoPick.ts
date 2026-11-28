/**
 * Automatic choice of the pending offers (PLAN-recompenses §5.4), driven by `?pick=`: for
 * end-to-end tests and quick play-throughs. Without it, the player chooses on the screen.
 */
import { hash2, mulberry32 } from '../core/rng';
import { chooseCard, type Emit, ensureOffer } from './progression';
import type { GameState, StoredOffer } from './state';

/** `first`: the first card; `random`: one at random (seeded); `none`: the screen chooses. */
export type PickMode = 'first' | 'random' | 'none';
export const PICK_MODES: readonly PickMode[] = ['first', 'random', 'none'];
/** Mode without `?pick=` (or with an unknown one): the player chooses on the screen. */
export const DEFAULT_PICK_MODE: PickMode = 'none';

/** Salt of the `random` mode stream (independent of the offer draw). */
const PICK_SALT = 0x5049434b; // "PICK"

/** The mode named by `?pick=`, or the default one. */
export function parsePickMode(param: string | null): PickMode {
  return PICK_MODES.find((m) => m === param) ?? DEFAULT_PICK_MODE;
}

/** Index of the card `mode` takes in `offer`, or null for `none` or an empty offer. */
export function autoPickIndex(state: GameState, offer: StoredOffer, mode: PickMode): number | null {
  if (mode === 'none' || offer.cards.length === 0) return null;
  if (mode === 'first') return 0;
  const rng = mulberry32(hash2(state.seed ^ PICK_SALT, offer.level, state.picks.length));
  return Math.floor(rng() * offer.cards.length);
}

/** Resolve every pending offer with `mode`, in order. Returns the number of cards taken. */
export function resolvePending(state: GameState, mode: PickMode, emit?: Emit): number {
  let taken = 0;
  while (mode !== 'none') {
    const offer = ensureOffer(state, emit);
    const index = offer ? autoPickIndex(state, offer, mode) : null;
    if (index === null || !chooseCard(state, index, emit)) break;
    taken += 1;
  }
  return taken;
}
