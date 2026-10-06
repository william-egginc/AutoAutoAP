/**
 * The instant answer's filters (the user, 6 Oct): "At most N ascensions" here; "Works inside my
 * hours" is done by the finder itself (routeFinder.ts `FindOptions.hours`), since it chooses among
 * the routes it keeps rather than hiding rows.
 */
import type { FoundRoutes, Route } from './routeFinder';

const lastTE = (r: Route) => r.legs[r.legs.length - 1]?.endTE ?? 0;

/** `found` without the routes above `max` ascensions (none taken off when `max` is null), with the
 *  fastest and the By a date answer picked again from the rest. */
export function atMostAscensions(found: FoundRoutes, max: number | null): FoundRoutes {
  if (max === null) return found;
  const cut = (rs: (Route | null)[]) => rs.map((r, k) => (k <= max ? r : null));
  const byAscensions = cut(found.byAscensions);
  const byDateByAscensions = cut(found.byDateByAscensions);
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);
  const byDate = found.byDate
    ? byDateByAscensions.reduce<Route | null>(
        (a, r) => (r && (!a || lastTE(r) > lastTE(a) || (lastTE(r) === lastTE(a) && r.end < a.end)) ? r : a),
        null
      )
    : null;
  return {
    best,
    byAscensions,
    byDate,
    byDateByAscensions,
    ...(found.outOfHours ? { outOfHours: found.outOfHours.filter(k => k <= max) } : {}),
  };
}

/** The filters as remembered in this browser. */
export interface InstantFilters {
  inHours: boolean;
  /** Null: any number of ascensions. */
  maxAscensions: number | null;
}
const FILTERS_KEY = 'aap-instant-filters';
export function readFilters(): InstantFilters {
  try {
    const v = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null') as Partial<InstantFilters> | null;
    const max = v?.maxAscensions;
    return {
      inHours: v?.inHours === true,
      maxAscensions: typeof max === 'number' && Number.isInteger(max) && max >= 1 ? max : null,
    };
  } catch {
    return { inHours: false, maxAscensions: null };
  }
}
export function writeFilters(f: InstantFilters): void {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    // Storage blocked: the filters simply start off next time.
  }
}
