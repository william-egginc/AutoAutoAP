/**
 * The Leaderboard's words that are not run results (components/auto/LeaderboardPanel.vue). Wording only (a *Words.ts
 * file, lib/resultCodeHash.ts `isWordingOnly`).
 */

/** All runs' Plan length cell: days to a tenth with the unit, as By a date's Spare ("380.0 d"; was "380.000",
 *  fluff review 2, 5 Nov 2026). A dash when the row has none. */
export function planLengthText(days: number | null | undefined): string {
  return typeof days === 'number' && Number.isFinite(days) ? `${days.toFixed(1)} d` : '—';
}
