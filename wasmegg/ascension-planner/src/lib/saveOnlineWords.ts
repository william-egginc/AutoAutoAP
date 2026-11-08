/**
 * PLACEHOLDER WORDS for Save online, Delete everything and the synced starting TE (spec-syncclient-a, 7 Nov 2026).
 * EVERY string here is a PLACEHOLDER written by UI, not by Words: the orchestrator asks Words for each and they move to
 * lib/syncWords.ts (Words' file) as they are approved. Words' own approved strings are in lib/syncWords.ts and are used
 * as they are. Wording only, so never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { ForgetCounts } from './syncedRecords';

// ---------------------------------------------------------------------------------------- the switch

/**
 * PLACEHOLDER. The line under the switch, on, while SYNC_RECORDS is off (lib/syncedRecords.ts): Words'
 * SAVE_ONLINE_LINE_ON names the starting TE and the tracker, which are not saved online until the sync is switched on,
 * so it would overclaim. Words' line less those.
 */
export const SAVE_ONLINE_LINE_ON_NO_SYNC =
  'Saved online, under a code made from your player ID, so every device shows the same: your followed routes, Setup and sharing choices, and saved answers. Anyone who knows your player ID can see them.';

// ---------------------------------------------------------------------------------------- Delete everything

/** PLACEHOLDER. What stays, after Words' SYNC_DELETE_CONFIRM (client brief section 4.1 asks for both lines). */
export const SYNC_DELETE_STAYS =
  'Results you shared with the Leaderboard stay (hide them from My runs). Other devices keep their own copy until Save online is turned off there too.';
/** PLACEHOLDER. The button while the call runs. */
export const SYNC_DELETE_RUNNING = 'Deleting…';
/** PLACEHOLDER. The button after a network failure. */
export const SYNC_DELETE_RETRY = 'Try again';

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/**
 * PLACEHOLDER. What was deleted (the collector counts rows: a followed route keeps up to 5 versions, Setup and choices
 * up to 5 each, so these are saved versions, not routes).
 */
export function forgetCountsWords(d: ForgetCounts): string {
  return `Deleted from the planner's server: ${n(d.follows, 'saved version', 'saved versions')} of your followed routes, ${n(d.prefs, 'saved version', 'saved versions')} of your Setup and choices, ${n(d.answers, 'instant answer', 'instant answers')}, ${n(d.synced, 'starting TE or tracker record', 'starting TE or tracker records')}.`;
}

/** "2 minutes", "1 hour" (rounded up). */
function waitWords(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m < 60) return n(m, 'minute', 'minutes');
  return n(Math.ceil(m / 60), 'hour', 'hours');
}
/** PLACEHOLDER. Why Delete did not work (nothing here changed). */
export function forgetFailWords(why: 'cannot' | 'limit' | 'off' | 'offline' | 'error', retryAfter?: number): string {
  if (why === 'cannot' || why === 'off') return 'This server cannot delete yet.';
  if (why === 'limit') return `Too many deletions this hour. Try again in ${waitWords(retryAfter ?? 3600)}.`;
  if (why === 'offline') return "Couldn't reach the planner's server. Nothing was deleted.";
  return 'Something went wrong on the server. Nothing was deleted.';
}

// ---------------------------------------------------------------------------------------- the starting TE banner

/** PLACEHOLDER. The banner's second button (brief section 5 "Keep the override"; players never read "override"). */
export const START_TE_KEEP = 'Keep my typed TE';
/** PLACEHOLDER. The banner when another device set a starting TE (brief section 5, its words). `saveTE` null: unknown. */
export function cloudStartTeWords(typed: number, saveTE: number | null): string {
  return saveTE === null
    ? `Another device set a starting TE of ${typed}.`
    : `Another device set a starting TE of ${typed}. Your save says ${saveTE}.`;
}
/** PLACEHOLDER. Its first button: use the other device's starting TE. */
export const START_TE_USE_CLOUD = 'Use it';
