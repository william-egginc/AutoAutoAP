/**
 * "YOU WON'T REACH R1 BEFORE YOU SLEEP" (Jordan, 15 Nov 2026; aaap-tools notes/sleep-before-r1-scope-2026-11-15.md).
 * R1 is the ascension's Resilience visit before H1 (the first Humility shift), where the silos are bought, by waits of
 * up to an hour after the shift (auto/shifts/r1.ts `runSiloBudgetPlan(…, 3600, 3600)`). Until the last of those buys the
 * farm has one silo (silos reset on every prestige), so a player who goes to sleep before then leaves it away on one
 * silo all night (game expert, 15 Nov 2026). This says when that happens so the player can prestige in the morning
 * or recalculate. A warning only: no route is priced or chosen differently.
 *
 *   - Only with the player's hours set (search/availability.ts); "sleep" is any time outside them.
 *   - With held shifts (the default): the plan already waits for the player (simulated legs hold each shift,
 *     auto/hold.ts; table legs start where the whole opening fits, search/routeFinder.ts `heldOpeningStart`), so the
 *     same case is the softer "R1 waits until 7:00 AM, so your farm has 1 silo overnight" (Jordan, 15 Nov 2026):
 *     `held: true` and `waitsUntil`, when the player's hours start again after `sleepAt`.
 *   - R1: a Resilience shift before the leg's first Humility shift (R1 is skipped when it would buy nothing, and the
 *     first Resilience shift is then R2, weeks later). The window runs from the start to R1's last buy: legs keep
 *     shifts, not actions, so that is bounded by the next shift (C3's) and by an hour after R1 (`doneBy`). `exact`:
 *     R1's shift is known.
 *   - A fresh table-priced leg doesn't carry its opening's shifts (routeFinder.ts RouteLeg.shifts starts after the
 *     build-up), so the window is bounded by the opening's measured span (search/openingSpan.ts: start to the shift
 *     into C3, after R1's buys), and the warning says "about" (`exact: false`). A leg with neither (a continue, or one
 *     already past R1) has no R1 here: no warning.
 *
 * Kept out of the result-code hash: imported by components only, never by lib/buildUpTracker.ts or lib/nowPlan.ts
 * (both hashed; src/lib/resultCodeHash.ts RESULT_CODE_FILES).
 */
import { isAvailable, nextAvailable, type Availability } from '@/search/availability';
import { isConstrained } from '@/search/availabilitySchedule';
import { openingSpan } from '@/search/openingSpan';

export interface SleepBeforeR1 {
  /** R1's shift (exact), or the latest it can be (not exact: then the same as `doneBy`), unix seconds. */
  r1At: number;
  /** R1's silo buys are done by then, unix seconds. */
  doneBy: number;
  /** The first instant from the start that falls outside the player's hours, unix seconds. */
  sleepAt: number;
  exact: boolean;
  /** Held shifts: R1 waits for the player; `waitsUntil` is when their hours start again. Absent when not held. */
  held?: true;
  waitsUntil?: number;
}

/** R1 buys silos for at most an hour after its shift. */
const R1_BUY_SECONDS = 3600;

/** The scan step: 15 minutes, as routeFinder.ts `awayInOpening`. Hours are whole hours, so no change is missed. */
const STEP = 900;

export function sleepBeforeR1(x: {
  /** The ascension's start (the prestige), unix seconds. */
  start: number;
  /** Its shifts, when known: when, and the egg switched TO. */
  shifts?: readonly { at: number; egg: string }[] | null;
  /** A fresh ascension whose OPENING's shifts (C1 to C3, R1 among them) aren't in `shifts`: a table-priced leg
   *  (routeFinder.ts RouteLeg.shifts starts at H1), with its start TE. Not for a simulated leg, whose shifts are all
   *  there: one with no R1 before H1 skipped R1. */
  fresh?: boolean;
  startTE?: number;
  hours: Availability | null | undefined;
  /** The player's shifts wait for their hours (deferShifts / holdShifts). */
  heldShifts?: boolean;
}): SleepBeforeR1 | null {
  const hours = x.hours;
  if (!hours || !isConstrained(hours)) return null;
  const shifts = x.shifts ?? [];
  const h1 = shifts.findIndex(s => s.egg === 'humility');
  const i = shifts.findIndex((s, k) => s.egg === 'resilience' && (h1 < 0 || k < h1));
  let r1At: number;
  let doneBy: number;
  let exact: boolean;
  if (i >= 0) {
    r1At = shifts[i].at;
    const next = shifts[i + 1]?.at;
    doneBy = Math.min(r1At + R1_BUY_SECONDS, next ?? Infinity);
    exact = true;
  } else if (x.fresh && typeof x.startTE === 'number') {
    r1At = doneBy = x.start + openingSpan(x.startTE, x.start);
    exact = false;
  } else return null;
  if (!(doneBy > x.start)) return null;
  // The first instant outside the hours before the buys are done (one AT doneBy is fine: they're done). Strictly
  // before `doneBy`, so a warning always has sleepAt < doneBy.
  for (let t = x.start; t < doneBy; t = Math.min(t + STEP, doneBy)) {
    if (!isAvailable(t, hours)) {
      const sleepAt = hoursEndedAt(t, hours);
      return x.heldShifts
        ? { r1At, doneBy, sleepAt, exact, held: true, waitsUntil: nextAvailable(sleepAt, hours) }
        : { r1At, doneBy, sleepAt, exact };
    }
  }
  return null;
}

/** When the stretch outside the hours that holds `t` began (`t` itself when it just began; a player who prestiges
 *  after their hours ended is told when they ended). At most a week back. */
function hoursEndedAt(t: number, hours: Availability): number {
  let s = t;
  for (let i = 0; i < (7 * 86400) / STEP && !isAvailable(s - STEP, hours); i++) s -= STEP;
  // To the minute: the scan's steps start wherever the leg starts, not on the hour.
  for (let i = 0; i < STEP / 60 && !isAvailable(s - 60, hours); i++) s -= 60;
  return s;
}
