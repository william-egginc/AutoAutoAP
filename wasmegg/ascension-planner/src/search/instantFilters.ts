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

/** One count's route improved by the background polish: hours sooner (Fastest) or, By a date, the TE
 *  gained and the hours more to spare. */
export interface PolishGain {
  k: number;
  hours: number;
  te: number;
}

/** The counts whose route `after` improves on `before`: Fastest strictly sooner (by more than a
 *  minute); By a date (`dated`) a higher TE, or the same TE sooner. */
export function polishGains(before: FoundRoutes, after: FoundRoutes, dated: boolean): PolishGain[] {
  const out: PolishGain[] = [];
  const was = dated ? before.byDateByAscensions : before.byAscensions;
  const now = dated ? after.byDateByAscensions : after.byAscensions;
  now.forEach((r, k) => {
    const b = was[k];
    if (!r || !b) return;
    const te = dated ? lastTE(r) - lastTE(b) : 0;
    const hours = (b.end - r.end) / 3600;
    if (te > 0 || (te === 0 && hours > 1 / 60)) out.push({ k, hours, te });
  });
  return out;
}

/** "4 ascensions 4.1 h sooner; 7 ascensions +1 TE". */
export function describeGains(gains: PolishGain[], dated: boolean): string {
  return gains
    .map(g => {
      const h = `${g.hours >= 10 ? g.hours.toFixed(0) : g.hours.toFixed(1)} h`;
      const what = g.te > 0 ? `+${g.te} TE` : dated ? `${h} more to spare` : `${h} sooner`;
      return `${g.k} ascension${g.k === 1 ? '' : 's'} ${what}`;
    })
    .join('; ');
}
