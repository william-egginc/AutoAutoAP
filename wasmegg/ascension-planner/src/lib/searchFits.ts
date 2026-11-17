/**
 * Whether a search result was priced on a given save (17 Nov 2026). Kept apart from lib/searchPlan.ts so the snapshot
 * store (search/instantSnapshot.ts) can use it without importing the plan code.
 */

/** A snapshot is one save's: a `search` priced on a save further than this from the snapshot's `meta.backupTime` is not
 *  its (second path, 17 Nov 2026: a newer save's snapshot carried the older save's result). Tighter than the kept
 *  results' ten minutes, since one snapshot is one save. */
export const SNAP_SAME_SAVE_SECONDS = 60;

/** The result fits the save: it was priced on it (within `tolerance`), or either time is unknown (as before the stamp). */
export function searchFitsSave(s: { backupAt?: number | null } | null | undefined, saveSeconds: number | null | undefined, tolerance = SNAP_SAME_SAVE_SECONDS): boolean {
  const a = s?.backupAt;
  if (!a || !(a > 0) || !saveSeconds || !(saveSeconds > 0)) return true;
  return Math.abs(a - saveSeconds) <= tolerance;
}
