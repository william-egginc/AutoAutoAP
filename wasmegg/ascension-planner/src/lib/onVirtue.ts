/**
 * Whether the player is already on virtue: ascending, with a virtue farm going (Jordan, 16 Oct 2026). "When
 * should I start?" (StartTimeCard.vue) is for a player not on virtue yet, coming back after a break before
 * their first ascension of the plan: it prices a route as a fresh start at every hour of the next week.
 * Once a virtue farm is going, the plan's first ascension is that one, already started, so there is no
 * start to pick and the page and its links are hidden.
 *
 * Read off the save the same way the planner finds the farm it continues (stores/initialState.ts) and the
 * run's pre-flight tells "no virtue farm" from "still loading" (stores/chainSearch.ts `reviewRunInputs`,
 * search/health.ts): a farm on one of the five virtue eggs (egg types 50 to 54). A save last synced on the
 * home farm or a contract has none, whatever TE it has, and counts as not on virtue: its plan starts with a
 * fresh ascension, which is exactly when a start time matters.
 *
 * Null with no save loaded: it can't be known, and the page shows (it asks for the save itself).
 */
export function saveOnVirtue(rawBackup: unknown): boolean | null {
  if (!rawBackup || typeof rawBackup !== 'object') return null;
  const farms = (rawBackup as { farms?: unknown }).farms;
  if (!Array.isArray(farms)) return false;
  return farms.some(f => {
    const egg = (f as { eggType?: unknown } | null)?.eggType;
    return typeof egg === 'number' && egg >= 50 && egg <= 54;
  });
}

/** Whether to offer "When should I start?" (its Science tab, its page, the "Check start times" links). */
export function offerStartTimes(rawBackup: unknown): boolean {
  return saveOnVirtue(rawBackup) !== true;
}
