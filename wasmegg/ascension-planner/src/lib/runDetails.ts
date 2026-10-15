/**
 * The run bar's Details (RunProgressBar.vue): what each search screen's in-page progress said beyond the
 * bar's own line (Jordan, 16 Oct 2026: the in-page progress header, bar and time line are gone, and the
 * floating bar is the one progress display). The bar already says the stage, the routes done of the
 * estimate, the time left (or "measuring") and the best so far; these are the rest, so nothing the
 * panels said is lost. '' when there is nothing more to say.
 *
 *   Nearby routes: the run's own detail ("1,204 / 2,200", "resumed with 340 routes already priced"), the
 *                  routes from the earlier run, the measured seconds a route, and that the estimate is an
 *                  upper bound.
 *   Exhaustive:    the seconds a route, measured here.
 *   By a date:     how long it has been going, the first guess (and for how many workers), more routes
 *                  than estimated, how the estimate was learned, and the legs simulated.
 */
import { plural } from '@/lib/format';

export interface RunDetailInput {
  kind: 'smart' | 'full' | 'by-date' | 'start-times';
  /** The chain search's detail line (store `detail`). */
  detail?: string;
  /** Nearby routes: routes carried over from the earlier run (store `chainsReplayed`). */
  replayed?: number;
  /** Measured seconds a route (store `secondsPerChain`); 0 before the first batch. */
  secondsPerRoute?: number;
  /** By a date: "12 min" since it started. */
  elapsed?: string;
  /** By a date: the first guess, "11 min for 7 workers, 4 now". */
  firstGuess?: string;
  /** By a date: routes priced, and the estimate. */
  done?: number;
  estimated?: number | null;
  /** By a date: how the estimate was learned (search/deadlineEstimate.ts `estimateNote`). */
  estimateNote?: string;
  /** By a date: legs simulated so far. */
  legs?: number;
}

export function runDetailLine(d: RunDetailInput): string {
  const parts: string[] = [];
  const rate = (digits: number) =>
    d.secondsPerRoute && d.secondsPerRoute > 0 ? `${d.secondsPerRoute.toFixed(digits)} s/route measured here` : '';
  if (d.kind === 'smart') {
    if (d.detail) parts.push(d.detail);
    if (d.replayed) parts.push(`${plural(d.replayed, 'route')} from the earlier run`);
    parts.push(rate(1));
    // Was the in-page count's own words (search/smartCount.ts, 12 Oct): the estimate is an upper bound.
    parts.push('the estimate is an upper bound: it stops when nothing moves');
  } else if (d.kind === 'full') {
    parts.push(rate(2));
  } else if (d.kind === 'by-date') {
    if (d.elapsed) parts.push(`${d.elapsed} so far`);
    if (d.firstGuess) parts.push(`first guess ${d.firstGuess}`);
    if (d.estimated && (d.done ?? 0) >= d.estimated)
      parts.push(`more than the ~${d.estimated.toLocaleString()} routes estimated`);
    if (d.estimateNote) parts.push(d.estimateNote);
    if (d.legs) parts.push(`${plural(d.legs, 'leg')} simulated`);
  }
  return parts.filter(Boolean).join(' · ');
}
