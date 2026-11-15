/**
 * The Setup line next to the worker count when Safari starts a run with fewer workers than the player chose
 * (lib/safariWorkers.ts; the store's `chainSearch.safariStart` is `{ workers, chosen }` or null). Safari ended two runs at
 * 7 workers where 5 finished and was not slower, so Chain Finder and By a date start at (cores - 3) there. The saved
 * choice is kept; setting a number by hand uses it for this visit. Results never depend on the worker count. Wording only.
 */
export function safariStartWords(s: { workers: number; chosen: number } | null | undefined): string {
  if (!s || s.workers === s.chosen) return '';
  const w = s.workers === 1 ? '1 worker' : `${s.workers} workers`;
  return `Safari starts runs with ${w}, not the ${s.chosen} you chose, because it has stopped runs that used more. Results are the same, only the time changes. Pick a number here to use it for this visit.`;
}
