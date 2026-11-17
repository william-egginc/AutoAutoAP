/**
 * Whether a search result was priced on a given save (17 Nov 2026). Kept apart from lib/searchPlan.ts so the snapshot
 * store (search/instantSnapshot.ts) can use it without importing the plan code.
 */

/** A snapshot is one save's: a `search` priced on a save further than this from the snapshot's `meta.backupTime` is not
 *  its (second path, 17 Nov 2026: a newer save's snapshot carried the older save's result). Tighter than the kept
 *  results' ten minutes, since one snapshot is one save. */
export const SNAP_SAME_SAVE_SECONDS = 60;

/** How long before a save a result can be done and still be that save's (clocks): ten minutes, as the kept results' tolerance. */
export const DONE_BEFORE_SAVE_SECONDS = 10 * 60;

/**
 * The result was done (`at`, ms) BEFORE the save existed, so it cannot have been priced on it, whatever else it says
 * (Jordan's screenshot, 17 Nov 2026: the old beta re-stamped a Nov 15 Custom result under the Nov 17 save, with no
 * `backupAt`, and My runs read "Calculated from your Nov 17 at 9:50 AM save at Nov 15 at 4:23 PM"). Unknown: false.
 */
export function doneBeforeSave(s: { at?: number | null } | null | undefined, saveSeconds: number | null | undefined): boolean {
  const at = s?.at;
  if (!at || !(at > 0) || !saveSeconds || !(saveSeconds > 0)) return false;
  return at / 1000 < saveSeconds - DONE_BEFORE_SAVE_SECONDS;
}

/** The result fits the save: it was priced on it (within `tolerance`), or either time is unknown (as before the stamp);
 *  never when it was done before the save (`doneBeforeSave`). */
export function searchFitsSave(s: { backupAt?: number | null; at?: number | null } | null | undefined, saveSeconds: number | null | undefined, tolerance = SNAP_SAME_SAVE_SECONDS): boolean {
  if (doneBeforeSave(s, saveSeconds)) return false;
  const a = s?.backupAt;
  if (!a || !(a > 0) || !saveSeconds || !(saveSeconds > 0)) return true;
  return Math.abs(a - saveSeconds) <= tolerance;
}
