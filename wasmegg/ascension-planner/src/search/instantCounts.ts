/**
 * Which of the instant answer's per-count routes its table shows at first: every count up to one past
 * the best (the table's and the exact check's), and the exact check's best wherever it is. Past that,
 * more ascensions only add stops that no longer help (routeFinder.ts USEFUL_STOP_MAX); the rest are
 * behind "Show more ascension counts".
 */
export function countsShown<R extends { legs: unknown[] }>(
  rows: R[],
  best: R | null | undefined,
  exactBest: R | null | undefined
): { shown: R[]; hidden: number; limit: number } {
  const limit = Math.max(best?.legs.length ?? 0, exactBest?.legs.length ?? 0) + 1;
  const shown = rows.filter(r => r.legs.length <= limit || r === exactBest);
  return { shown, hidden: rows.length - shown.length, limit };
}
