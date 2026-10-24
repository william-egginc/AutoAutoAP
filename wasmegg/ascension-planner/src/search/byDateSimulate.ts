/**
 * What By a date's "Simulate this plan" (ByDateRouteCard.vue) hands Single run (Classic): the route, from the plan
 * start its run priced it from, with its legs (time off, and the build its first ascension took) and
 * the run's own first-ascension setting (search/simulateRoute.ts, stores/chainSearch.ts `applyChain`),
 * as the instant answer's rows do.
 *
 * Single run (Classic, Joo's) has no "Continue my build-up": a route whose first ascension was a
 * build-up is passed as it is, and Single run prices that ascension as a fresh build or a continue, so
 * the button says so.
 */
import type { DeadlineRoute } from './deadline';
import type { FirstAscension } from './firstAscension';
import type { LegSummary } from './types';
import { NAMES } from '@/lib/siteNav';

export const BUILDUP_NOTE = `${NAMES.classic} prices the first ascension as a fresh build/continue.`;

export function byDateSimulate(
  route: DeadlineRoute,
  run: { planStart?: number | null; firstAscension?: FirstAscension | null }
): {
  chain: number[];
  opts: { start?: number; legs?: LegSummary[]; firstAscension?: FirstAscension; from: string };
  note: string;
} {
  const legs = Array.isArray(route.legs) && route.legs.length ? route.legs : [];
  const first = legs[0]?.key;
  const buildUp = first === 'buildup' || (!first && run.firstAscension === 'buildup');
  return {
    chain: [...route.chain],
    opts: {
      ...(run.planStart && run.planStart > 0 ? { start: run.planStart } : {}),
      ...(legs.length ? { legs } : {}),
      ...(run.firstAscension ? { firstAscension: run.firstAscension } : {}),
      from: 'your By a date search',
    },
    note: buildUp ? BUILDUP_NOTE : '',
  };
}
