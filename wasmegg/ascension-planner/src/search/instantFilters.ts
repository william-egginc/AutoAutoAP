/**
 * The instant answer's filters (the user, 6 Oct): the ascensions "From … to …" here (Jordan, 24 Oct 2026: was "At
 * most N ascensions"); "Works inside my hours" is done by the finder itself (routeFinder.ts `FindOptions.hours`), since
 * it chooses among the routes it keeps rather than hiding rows.
 */
import type { FoundRoutes, OutsideRoute, Route } from './routeFinder';

const lastTE = (r: Route) => r.legs[r.legs.length - 1]?.endTE ?? 0;

/** The ascensions the instant answer keeps: null at either end for no bound. Both ends count the player's own first
 *  ascension, as "At most N" did. */
export interface AscBounds {
  min: number | null;
  max: number | null;
}
export const NO_BOUNDS: AscBounds = { min: null, max: null };
const inside = (k: number, b: AscBounds) => (b.min === null || k >= b.min) && (b.max === null || k <= b.max);

/** The count with a route nearest the range (below or above it; a tie goes to fewer), as the note shows it. */
function nearestOutside(rs: (Route | null)[], b: AscBounds): OutsideRoute | null {
  let pick: { k: number; d: number; r: Route } | null = null;
  rs.forEach((r, k) => {
    if (!r || inside(k, b)) return;
    const d = b.min !== null && k < b.min ? b.min - k : k - (b.max ?? k);
    if (!pick || d < pick.d) pick = { k, d, r };
  });
  const p = pick as { k: number; d: number; r: Route } | null;
  return p ? { ascensions: p.k, chain: [...p.r.chain], end: p.r.end, endTE: lastTE(p.r) } : null;
}

/** `found` with only the routes inside `bounds` (nothing taken off without bounds), with the fastest and the By a date
 *  answer picked again from the rest. When none is left for one of them, `outside` names the nearest count that has
 *  one, for the card's "No route in this range" note. */
export function withinAscensions(found: FoundRoutes, bounds: AscBounds): FoundRoutes {
  if (bounds.min === null && bounds.max === null) return found;
  const keep = (k: number) => inside(k, bounds);
  const cut = (rs: (Route | null)[]) => rs.map((r, k) => (keep(k) ? r : null));
  const byAscensions = cut(found.byAscensions);
  const byDateByAscensions = cut(found.byDateByAscensions);
  const best = byAscensions.reduce<Route | null>((a, r) => (r && (!a || r.end < a.end) ? r : a), null);
  const byDate = found.byDate
    ? byDateByAscensions.reduce<Route | null>(
        (a, r) => (r && (!a || lastTE(r) > lastTE(a) || (lastTE(r) === lastTE(a) && r.end < a.end)) ? r : a),
        null
      )
    : null;
  const fastestOut = best ? null : nearestOutside(found.byAscensions, bounds);
  const dateOut = byDate || !found.byDate ? null : nearestOutside(found.byDateByAscensions, bounds);
  return {
    best,
    byAscensions,
    byDate,
    byDateByAscensions,
    ...(found.outOfHours ? { outOfHours: found.outOfHours.filter(keep) } : {}),
    // Each kept count's other routes go along (the Prestige-by finder reads them: search/prestigeBy.ts).
    ...(found.alternatives ? { alternatives: found.alternatives.map((rs, k) => (keep(k) ? rs : [])) } : {}),
    ...(found.dateAlternatives
      ? { dateAlternatives: found.dateAlternatives.map((rs, k) => (keep(k) ? rs : [])) }
      : {}),
    ...(fastestOut || dateOut
      ? { outside: { ...(fastestOut ? { fastest: fastestOut } : {}), ...(dateOut ? { date: dateOut } : {}) } }
      : {}),
  };
}

/** `found` without the routes above `max` ascensions (none taken off when `max` is null). */
export function atMostAscensions(found: FoundRoutes, max: number | null): FoundRoutes {
  return withinAscensions(found, { min: null, max });
}

/** The bounds `shift` ascensions further on (the "Prestige by" lookups start after the player's own first
 *  ascension): an end that falls below 1 is no bound. */
export function boundsAfter(b: AscBounds, shift: number): AscBounds {
  const at = (n: number | null) => (n === null ? null : n - shift >= 1 ? n - shift : null);
  return { min: at(b.min), max: b.max === null ? null : b.max - shift };
}

/** "3 to 5" / "at least 3" / "at most 5" / "exactly 4"; '' without bounds. */
export function boundsText(b: AscBounds): string {
  if (b.min !== null && b.max !== null) return b.min === b.max ? `exactly ${b.min}` : `${b.min} to ${b.max}`;
  if (b.min !== null) return `at least ${b.min}`;
  if (b.max !== null) return `at most ${b.max}`;
  return '';
}

/** One end as typed (blank or not a whole number from 1: no bound), clamped to `top`. */
export function boundInput(v: unknown, top: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(top, n) : null;
}

/** The bounds with one end set to `value`: when it passes the other end, the other moves along to meet it. */
export function setBound(b: AscBounds, end: 'min' | 'max', value: number | null): AscBounds {
  const next = { ...b, [end]: value };
  if (next.min !== null && next.max !== null && next.min > next.max) {
    if (end === 'min') next.max = next.min;
    else next.min = next.max;
  }
  return next;
}

/** The filters as remembered in this browser. */
export interface InstantFilters {
  inHours: boolean;
  /** Null: no upper bound. */
  maxAscensions: number | null;
  /** Null: no lower bound (absent in filters saved before 24 Oct 2026, when there was only "At most N"). */
  minAscensions: number | null;
}
export const filterBounds = (f: InstantFilters): AscBounds => ({ min: f.minAscensions, max: f.maxAscensions });
const FILTERS_KEY = 'aap-instant-filters';
export function readFilters(): InstantFilters {
  try {
    const v = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null') as Partial<InstantFilters> | null;
    const whole = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null);
    const max = whole(v?.maxAscensions);
    const min = whole(v?.minAscensions);
    return {
      inHours: v?.inHours === true,
      maxAscensions: max,
      // A lower bound above the upper one (written by hand): the upper one wins.
      minAscensions: min !== null && max !== null && min > max ? max : min,
    };
  } catch {
    return { inHours: false, maxAscensions: null, minAscensions: null };
  }
}
export function writeFilters(f: InstantFilters): void {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    // Storage blocked: the filters simply start off next time.
  }
}

/**
 * "Works inside my hours" ticked by default (Jordan, 22 Oct 2026): on whenever the player has set playing hours (Let me
 * pick my hours on, with a window that isn't any hour). The player's own tick or untick is remembered apart from the
 * filters and wins: once unticked it is never ticked again by itself, until they tick it. No choice and no hours (or
 * any hour): off, as before.
 */
export type InsideHoursChoice = 'on' | 'off' | null;
const INSIDE_HOURS_KEY = 'aap-instant-inside-hours';
export function defaultInsideHours(hoursSet: boolean, windowIsAnyHour: boolean, stored: InsideHoursChoice): boolean {
  if (stored === 'off') return false;
  if (stored === 'on') return true;
  return hoursSet && !windowIsAnyHour;
}
/** The tick box's state on a screen: `hoursOn` Let me pick my hours on with hours given, `constrained` a window that
 *  isn't any hour, `remembered` the filters' own value (kept as before with no hours, or any hour and no choice). */
export function insideHoursFor(
  hoursOn: boolean,
  constrained: boolean,
  stored: InsideHoursChoice,
  remembered: boolean
): boolean {
  if (!hoursOn || (stored === null && !constrained)) return remembered;
  return defaultInsideHours(constrained, !constrained, stored);
}
export function readInsideHoursChoice(): InsideHoursChoice {
  try {
    const v = localStorage.getItem(INSIDE_HOURS_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}
export function writeInsideHoursChoice(c: 'on' | 'off'): void {
  try {
    localStorage.setItem(INSIDE_HOURS_KEY, c);
  } catch {
    // Storage blocked: the default applies again next time.
  }
}

/**
 * By a date's "I need to ascend at the last stop before the deadline" ticked by default whenever playing hours are set
 * (the math review, 24 Oct 2026, finding 9: a TE counts once a prestige claims it, and a reach in the night can't be
 * claimed before a morning deadline). The same rule as "Works inside my hours" (`defaultInsideHours`): the player's
 * own tick or untick is remembered and wins, so once unticked it is never ticked again by itself. No hours, or any
 * hour, and no choice: off, as before.
 */
const ASCEND_NEEDED_KEY = 'aap-ascend-needed';
export function ascendNeededFor(hoursOn: boolean, constrained: boolean, stored: InsideHoursChoice): boolean {
  if (!hoursOn) return false;
  return defaultInsideHours(constrained, !constrained, stored);
}
export function readAscendNeededChoice(): InsideHoursChoice {
  try {
    const v = localStorage.getItem(ASCEND_NEEDED_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}
export function writeAscendNeededChoice(c: 'on' | 'off'): void {
  try {
    localStorage.setItem(ASCEND_NEEDED_KEY, c);
  } catch {
    // Storage blocked: the default applies again next time.
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
  // Read back from a saved answer: anything that isn't a number (an Infinity saved as null) is left out, never a
  // throw while the card draws.
  return (Array.isArray(gains) ? gains : [])
    .filter(g => !!g && Number.isFinite(g.hours) && Number.isFinite(g.te) && Number.isFinite(g.k))
    .map(g => {
      const h = `${g.hours >= 10 ? g.hours.toFixed(0) : g.hours.toFixed(1)} h`;
      const what = g.te > 0 ? `+${g.te} TE` : dated ? `${h} more to spare` : `${h} sooner`;
      return `${g.k} ascension${g.k === 1 ? '' : 's'} ${what}`;
    })
    .join('; ');
}
