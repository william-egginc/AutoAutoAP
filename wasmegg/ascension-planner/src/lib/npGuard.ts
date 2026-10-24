/**
 * @module npGuard
 * @description No-prestige days keep a run off the leaderboard (Jordan, 24 Oct 2026).
 *
 * WHY. A run priced with no-prestige days (search/noPrestige.ts, the store's `noPrestige`) waits its
 * prestiges past those days, so it is a different race from a run without them, and the board has no
 * field that says so: the two would rank against each other. Until it does, such runs are not sent.
 * They still run, can be followed, saved and shown on My runs; only the board send is blocked.
 *
 * One predicate for both ends: the store's send (stores/chainSearch.ts `sendSubmission`, the one place
 * that posts a run or answer row, so no screen can get round it) and every send button, which is
 * greyed out with NoPrestigeSendNote.vue beside it.
 */
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';

/** What the send buttons say, and what a blocked send answers. */
export const NO_PRESTIGE_SEND_NOTE =
  "Runs priced with no-prestige days aren't sent to the leaderboard yet, so they don't rank against runs without them.";

/** True while any usable no-prestige day is set: a half-typed row prices nothing, so it blocks nothing. */
export function sendBlockedByNoPrestige(days: readonly TimeOffDates[] | null | undefined): boolean {
  return usableTimeOff(days ? [...days] : []).length > 0;
}
