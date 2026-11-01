/**
 * The words of "starting fresh would be sooner" (lib/freshSooner.ts; spec-r7verify, 1 Nov 2026). ALL DRAFT (Words).
 * Wording only (lib/resultCodeHash.ts `isWordingOnly`): a change here never recomputes a kept result.
 */
import { dateAt } from './eventWhen';
import { compactDuration } from './duration';
import type { FreshSooner } from './freshSooner';

/** The button on the line. DRAFT. */
export const SWITCH_TO_FASTEST = 'Switch to Fastest';
/** The button that takes the override back. DRAFT. */
export const UNDO_FASTEST = 'Undo';

/** "Starting fresh would end this ascension 6d 12h sooner: Dec 27 at 8:31 pm vs Jan 2, 2027 at 8:58 pm." DRAFT. Dates
 *  in the zone given, the shared formatter (lib/eventWhen.ts `dateAt`). */
export function freshSoonerLine(f: FreshSooner, nowSeconds: number, zone: string): string {
  return `Starting fresh would end this ascension ${compactDuration(f.seconds)} sooner: ${dateAt(f.freshEnd, nowSeconds, zone)} vs ${dateAt(f.legEnd, nowSeconds, zone)}.`;
}

/** While the override holds. DRAFT. */
export const FASTEST_FOLLOWED_LINE = 'Following Fastest for this ascension. Setup is unchanged.';
