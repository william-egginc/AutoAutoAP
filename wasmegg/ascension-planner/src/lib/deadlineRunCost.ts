/**
 * What a By a date run cost this machine, as the `deadlineRunCost` field of its send (16 Nov 2026: By a
 * date sends never carried `run`, so the board could not tell a slow machine from slower code; 0 of 128
 * deadline rows had it). The shape is the Fastest `run` block's (`RunCost`), but under another name on
 * purpose: the board reads `run` as a Fastest chain's speed, and a By a date route is not a Fastest chain.
 *
 * ONE SPAN. Minutes and route count cover this session of the run: the seconds since it started here, and
 * the routes priced here. A carry-on's replayed routes took no time, and an earlier session's minutes
 * belong to routes this session did not price, so neither goes into the other's figure.
 *
 * Not in src/search (hashed); imported by stores/chainSearch.ts only.
 */
import type { RunCost } from '@/search/submission';

export function deadlineRunCost(x: {
  /** Seconds this session has run (start to now or to its end), before taking off the suspended time. */
  sessionSeconds: number;
  /** Seconds of it the tab was suspended or frozen. */
  suspendedSeconds: number;
  /** Routes priced in all, replayed ones included. */
  priced: number;
  /** Of them, the routes a carry-on took straight from its save. */
  replayed: number;
  workers: number;
  cores: number | null;
}): RunCost | null {
  const seconds = x.sessionSeconds - Math.max(0, x.suspendedSeconds);
  const fresh = x.priced - Math.max(0, x.replayed);
  if (!(seconds > 0) || !(fresh > 0) || !(x.workers > 0)) return null;
  return {
    workers: Math.max(1, Math.round(x.workers)),
    cores: x.cores !== null && Number.isFinite(x.cores) ? Math.max(0, Math.round(x.cores)) : null,
    minutes: Number((seconds / 60).toFixed(1)),
    suspendedMinutes: Number((Math.max(0, x.suspendedSeconds) / 60).toFixed(1)),
    secondsPerChain: Number((seconds / fresh).toFixed(2)),
  };
}
