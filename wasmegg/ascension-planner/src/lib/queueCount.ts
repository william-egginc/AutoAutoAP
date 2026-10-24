/**
 * One way to say how far a Full sweep queue has got, for the top run bar and the panel's count
 * (the user's tester, 12 Oct 2026: the bar said "32 of ~567 chains · chain 1 of 3" while the panel
 * said "2,223 · chain 1 of 3", the same run counted two ways). Both now name both scopes:
 * "chain 1 of 3: 32 of ~567 · whole queue ~2,223 chains".
 */
export function queueCountLine(o: {
  chain: { at: number; of: number };
  done: number;
  /** The running chain's own estimate. */
  total: number | null;
  /** Every chain of the queue, the running one included. */
  queueTotal: number | null;
}): string {
  const head = `box ${o.chain.at} of ${o.chain.of}: ${o.done.toLocaleString()}${
    o.total ? ` of ~${Math.round(o.total).toLocaleString()}` : ''
  } routes`;
  return o.queueTotal && Number.isFinite(o.queueTotal)
    ? `${head} · all boxes ~${Math.round(o.queueTotal).toLocaleString()} routes`
    : head;
}
