/**
 * Words for Save online, Delete everything and the synced starting TE (spec-syncclient-a, 7 Nov 2026), written by Words
 * on 8 Nov 2026 (they replace UI's placeholders; Jordan's OK for the switch and delete button is on record, the rest
 * follows the same rules). Words' earlier strings are in lib/syncWords.ts. Words' own approved strings are in lib/syncWords.ts and are used
 * as they are. Wording only, so never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { ForgetCounts } from './syncedRecords';

// ---------------------------------------------------------------------------------------- the switch

/**
 * The line under the switch, on, while SYNC_RECORDS is off (lib/syncedRecords.ts): Words'
 * SAVE_ONLINE_LINE_ON names the starting TE and the tracker, which are not saved online until the sync is switched on,
 * so it would overclaim. Words' line less those.
 */
export const SAVE_ONLINE_LINE_ON_NO_SYNC =
  'Saved online, under a code made from your player ID, so every device shows the same: your followed routes, Setup and sharing choices, and saved answers. Anyone who knows your player ID can see them.';

// ---------------------------------------------------------------------------------------- Delete everything

/**
 * What stays, after SYNC_DELETE_CONFIRM. True of the code: a shared result stays on the Leaderboard; another device
 * keeps its own copy and, with Save online on there, saves it online again the next time something changes.
 */
export const SYNC_DELETE_STAYS =
  'Results you shared with the Leaderboard stay there (you can hide them from My runs). Other devices keep their own copy and may save it online again; turn Save online off on them to stop that.';
/** The button while the call runs. */
export const SYNC_DELETE_RUNNING = 'Deleting…';
/** The button after a network failure. */
export const SYNC_DELETE_RETRY = 'Try again';

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/**
 * What was deleted (the collector counts rows: a followed route keeps up to 5 versions, Setup and choices
 * up to 5 each, so these are saved versions, not routes).
 */
export function forgetCountsWords(d: ForgetCounts): string {
  if (d.follows + d.prefs + d.answers + d.synced === 0) return 'Nothing was saved online for this account.';
  return `Deleted from the planner's server: ${n(d.follows, 'saved version', 'saved versions')} of your followed routes, ${n(d.prefs, 'saved version', 'saved versions')} of your Setup and choices, ${n(d.answers, 'instant answer', 'instant answers')}, ${n(d.synced, 'starting TE or tracker record', 'starting TE or tracker records')}.`;
}

/** "2 minutes", "1 hour" (rounded up). */
function waitWords(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m < 60) return n(m, 'minute', 'minutes');
  return n(Math.ceil(m / 60), 'hour', 'hours');
}
/** Why Delete did not work (nothing here changed). */
export function forgetFailWords(why: 'cannot' | 'limit' | 'off' | 'offline' | 'error', retryAfter?: number): string {
  if (why === 'cannot' || why === 'off') return 'Deleting is not available yet. Nothing was deleted.';
  if (why === 'limit') return `Too many deletions this hour. Try again in ${waitWords(retryAfter ?? 3600)}.`;
  if (why === 'offline') return "Couldn't reach the planner's server. Nothing was deleted.";
  return "Something went wrong on the planner's server. Nothing was deleted.";
}

// ---------------------------------------------------------------------------------------- the starting TE banner

/** The banner's second button (brief section 5 "Keep the override"; players never read "override"). */
export const START_TE_KEEP = 'Keep my typed TE';
/** The banner when another device set a starting TE (brief section 5, its words). `saveTE` null: unknown. */
export function cloudStartTeWords(typed: number, saveTE: number | null): string {
  return saveTE === null
    ? `Another device set a starting TE of ${typed}.`
    : `Another device set a starting TE of ${typed}. Your save says ${saveTE}.`;
}
/** Its first button: use the other device's starting TE. */
export const START_TE_USE_CLOUD = 'Use it';

// ---------------------------------------------------------------------------------------- R8: a typed start, unranked

/**
 * A /submit reply flagged 'typed-te' (collector spec-tesrc, FLAG_TYPED_TE=1): the run is on the flagged board because it
 * priced from a starting TE the player typed. Said in place of the plain "sent" (stores/chainSearch.ts `sendSubmission`).
 * Final (Words, 8 Nov 2026; Jordan approved typed-TE runs going unranked): says it was sent, that it is not ranked, and why.
 */
export const TYPED_TE_NOT_RANKED = "Sent, but not ranked: this run started from a TE you typed, not your save's.";
/** The same after a duplicate's own message, and for a best-so-far send (the "Sent" is already said). */
export const TYPED_TE_NOT_RANKED_SHORT = "Not ranked: this run started from a TE you typed, not your save's.";

/** Whether a send's message carries the typed-TE line, in either form (the long lead or the short note): the
 *  best-so-far send adds its own note then (stores/chainSearch.ts). Case does not matter. */
export function typedTeNoted(message: string): boolean {
  return message.toLowerCase().includes(TYPED_TE_NOT_RANKED_SHORT.toLowerCase());
}

// ------------------------------------------------------------------- Setup › Sharing: the saved-online fold's title

/**
 * The fold in Setup › Sharing that holds the "saved online" notices, beside the master Save online switch
 * (components/auto/YourSetup.vue; spec-uxpass item 11, 8 Nov 2026: it was titled "Saved online: your followed route
 * and your Setup", while the switch covers routes, Setup and sharing choices and saved answers). DRAFT (Words).
 */
export const SAVE_ONLINE_FOLD_TITLE = 'Save online';
/** After the title, from the switch: "Save online · on" / "Save online · off". DRAFT (Words). */
export const SAVE_ONLINE_FOLD_ON = 'on';
export const SAVE_ONLINE_FOLD_OFF = 'off';
