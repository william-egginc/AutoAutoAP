/**
 * "YOU WON'T REACH R1 BEFORE YOU SLEEP" (Jordan, 15 Nov 2026; aaap-tools notes/sleep-before-r1-scope-2026-11-15.md).
 * R1 is the ascension's first shift to Resilience, where the silos are bought: a player who goes to sleep before it
 * leaves the farm away on few silos all night. This says when that happens so the player can prestige in the morning
 * or recalculate. A warning only: no route is priced or chosen differently.
 *
 *   - Only with the player's hours set (search/availability.ts); "sleep" is any time outside them.
 *   - Not with held shifts: the plan already waits for the player there (simulated legs hold each shift, auto/hold.ts;
 *     table legs start where the whole opening fits, search/routeFinder.ts `heldOpeningStart`).
 *   - R1's instant: the leg's own first shift to Resilience when its shifts are known (`exact`). A fresh table-priced
 *     leg doesn't carry its opening's shifts (routeFinder.ts RouteLeg.shifts starts after the build-up), so R1 is
 *     bounded by the opening's measured span (search/openingSpan.ts: start to the shift into C3, R1 before it), and
 *     the warning says "about" (`exact: false`). A leg with neither (a continue) has no R1 here: no warning.
 *
 * Kept out of the result-code hash: imported by components only, never by lib/buildUpTracker.ts or lib/nowPlan.ts
 * (both hashed; src/lib/resultCodeHash.ts RESULT_CODE_FILES).
 */
import { isAvailable, type Availability } from '@/search/availability';
import { isConstrained } from '@/search/availabilitySchedule';
import { openingSpan } from '@/search/openingSpan';

export interface SleepBeforeR1 {
  /** When R1 is (exact) or at the latest (not exact), unix seconds. */
  r1At: number;
  /** The first instant from the start that falls outside the player's hours, unix seconds. */
  sleepAt: number;
  exact: boolean;
}

/** The scan step: 15 minutes, as routeFinder.ts `awayInOpening`. Hours are whole hours, so no change is missed. */
const STEP = 900;

export function sleepBeforeR1(x: {
  /** The ascension's start (the prestige), unix seconds. */
  start: number;
  /** Its shifts, when known: when, and the egg switched TO. */
  shifts?: readonly { at: number; egg: string }[] | null;
  /** A fresh ascension whose opening's shifts aren't in `shifts` (a table-priced leg), with its start TE. */
  fresh?: boolean;
  startTE?: number;
  hours: Availability | null | undefined;
  /** The player's shifts wait for their hours (deferShifts / holdShifts). */
  heldShifts?: boolean;
}): SleepBeforeR1 | null {
  const hours = x.hours;
  if (!hours || !isConstrained(hours) || x.heldShifts) return null;
  const r1 = x.shifts?.find(s => s.egg === 'resilience');
  let r1At: number;
  let exact: boolean;
  if (r1) {
    r1At = r1.at;
    exact = true;
  } else if (x.fresh && typeof x.startTE === 'number') {
    r1At = x.start + openingSpan(x.startTE, x.start);
    exact = false;
  } else return null;
  if (!(r1At > x.start)) return null;
  for (let t = x.start; ; t = Math.min(t + STEP, r1At)) {
    if (!isAvailable(t, hours)) return { r1At, sleepAt: t, exact };
    if (t >= r1At) return null;
  }
}
