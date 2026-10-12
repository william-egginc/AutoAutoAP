/**
 * Nearby routes' count, said one way everywhere (the user's tester, 12 Oct 2026). The route estimate
 * is an UPPER BOUND: the search stops as soon as nothing moves, so "0 / ~1,265 chains, 296 replayed"
 * read as if it had barely started. Routes priced (this run's plus those carried over from the
 * earlier run) against "up to" the estimate.
 */
export function smartCountText(o: {
  done: number;
  replayed: number;
  estimate: number;
  running: boolean;
  /** The level's name (Fast, Exact, Very high). */
  level: string;
}): string {
  const priced = o.done + o.replayed;
  const from = o.replayed ? `, ${o.replayed.toLocaleString()} of them from the earlier run` : '';
  const up = `up to ~${o.estimate.toLocaleString()}`;
  return o.running
    ? `${priced.toLocaleString()} routes priced of ${up}${from}`
    : `${priced.toLocaleString()} routes priced${from} (the estimate was ${up}; ${o.level} stops when nothing moves)`;
}
