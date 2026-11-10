/**
 * THE SILO TRICK SETTING, in the simulation's context (spec-silotrick, 10 Nov 2026). Jordan: "For silo trick, Plans should
 * have a setting in setup, off by default." The simulator already credits the silo trick (a wait into Monday's 2x event pays
 * the away time at 2x, capped at the silos: auto/shifts/helpers/advanceTime.ts) behind `context.deferForEarningsMode`, which
 * nothing in My runs, Fast, Exact, Custom or Single run turned on. `SearchInputs.siloTrick` (Setup) now does, in `legContext`.
 * Off (absent or false) leaves the context exactly as it was.
 */
import { describe, expect, it } from 'vitest';
import { legContext } from './leg';
import type { SearchInputs } from './types';

const inputs = (extra: Partial<SearchInputs>, ctxFlag?: boolean) =>
  ({ context: { deferForEarningsMode: ctxFlag }, availability: null, ...extra }) as unknown as SearchInputs;

describe('legContext and the silo trick setting', () => {
  it('turns the earnings-event deferral (the silo trick credit) on when the setting is on', () => {
    expect(legContext(inputs({ siloTrick: true }), 1_790_000_000).deferForEarningsMode).toBe(true);
  });

  it('leaves the context as it was when the setting is off or absent (as today)', () => {
    expect(legContext(inputs({ siloTrick: false }), 1_790_000_000).deferForEarningsMode).toBeFalsy();
    expect(legContext(inputs({}), 1_790_000_000).deferForEarningsMode).toBeFalsy();
    // A context that already asks for it (the Automatic Planner's own option) keeps it.
    expect(legContext(inputs({}, true), 1_790_000_000).deferForEarningsMode).toBe(true);
  });
});
