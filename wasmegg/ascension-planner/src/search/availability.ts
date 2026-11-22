/**
 * When the player is actually available to act, and what the search does about it.
 *
 * This replaces the narrower "excluded hours" window. Sleep is one case of a schedule — "available
 * 07:00-23:00, every day" — and a weekly calendar covers the rest: weekends only, evenings on
 * weekdays, no Wednesdays. Keeping two overlapping concepts would have meant two fingerprints, two
 * sets of CLI flags and two chances to disagree, so there is one model and sleep is a preset of it.
 *
 * WHAT THIS MODELS, PRECISELY. Every leg ends the instant its target TE is reached, and the very
 * next thing the plan asks for is a prestige — you cannot start the next ascension without it. The
 * simulator assumes that happens immediately. If a leg's target lands at 03:14 and you are asleep,
 * it does not; you prestige when you are next available, and everything downstream shifts. So a
 * constrained run moves each inter-leg handoff to the next available instant and charges the delay,
 * which then changes which weekly Research Sale boundary the next build phase lands on — which is
 * exactly why this has to be inside the objective the search minimises rather than a note printed
 * afterwards.
 *
 * WHAT IT DOES NOT MODEL, and this matters more than the part it does:
 *
 *   - Only the PRESTIGE instants are constrained. A build phase is hours or days of research
 *     buying, and the twelve shifts inside an ascension are scheduled by the simulator's own
 *     `te-wait` logic, so some of both will still fall outside your hours whatever the checkpoints
 *     are. `nightShifts` on each leg summary counts the shifts that do, so a plan cannot quietly
 *     claim to fit your schedule when it does not.
 *
 *   - The final leg is NOT pushed. Reaching the final target is not an action; there is nothing to
 *     do at that instant, so being unavailable for it costs nothing.
 *
 *   - The delay is charged in full, and the eggs the farm keeps laying while you wait ARE credited
 *     (creditWait), up to what the silos hold. The silo count is the save's, for every later
 *     ascension, which is cautious because later ascensions buy silos again.
 *
 * Setting a schedule changes what "best" means, so it is part of the run fingerprint (see
 * persistence.ts) and there is none by default. Chains scored with and without one are not
 * comparable, and every accuracy figure on record was measured without one.
 */
import { getTimezoneOffsetAt } from 'lib/planners/events';
import { blockedArray, isConstrained, validDays, weekIndex, type Availability } from './availabilitySchedule';

// The schedule's shape lives in availabilitySchedule.ts, which does not import lib/events (and so
// not its Pacific-time table). Re-exported so every existing importer keeps working. A module the
// Chain Explorer reaches must import from that file directly: see its header.
export {
  availabilityKey,
  describeAvailability,
  fromSleepHours,
  isConstrained,
  maskOfWindow,
  WEEK_HOURS,
  weekIndex,
  type Availability,
} from './availabilitySchedule';

/** Local hour-of-day, 0-23. One Intl call via `getTimezoneOffsetAt`, which is DST-exact — the
 *  offset is resolved AT that instant rather than assumed constant. */
export function localHour(unixSeconds: number, timezone: string): number {
  // Whole second: getTimezoneOffsetAt truncates the wall clock to seconds but subtracts the raw instant, so a
  // fractional instant reads the offset up to a second low (R2/R5).
  const s = Math.floor(unixSeconds);
  const wall = s + getTimezoneOffsetAt(timezone, s);
  return Math.floor((((wall % 86400) + 86400) % 86400) / 3600);
}

/** Local day of week, 0 = Sunday. 1970-01-01 was a Thursday, hence the +4. */
export function localDayOfWeek(unixSeconds: number, timezone: string): number {
  const s = Math.floor(unixSeconds);
  const wall = s + getTimezoneOffsetAt(timezone, s);
  return ((Math.floor(wall / 86400) % 7) + 4 + 7) % 7;
}

/**
 * Is this instant inside the schedule?
 *
 * The day test uses the day the SESSION started, not the calendar day. With a window of 18:00-02:00
 * on Friday, 01:00 on Saturday morning is still Friday night — testing Saturday would reject the
 * back half of every session the user explicitly asked for.
 */
export function isAvailable(unixSeconds: number, a: Availability): boolean {
  // Weekly hours (R10): the hour of the week, read once. A mask that is no schedule (nothing or everything blocked) is
  // available throughout (availabilitySchedule.ts isConstrained).
  if (a.blocked !== undefined) {
    const m = blockedArray(a);
    if (!m) return true;
    const s = Math.floor(unixSeconds);
    const wall = s + getTimezoneOffsetAt(a.timezone, s);
    const hour = Math.floor((((wall % 86400) + 86400) % 86400) / 3600);
    const dow = ((Math.floor(wall / 86400) % 7) + 4 + 7) % 7;
    return m.blocked[weekIndex(dow, hour)] === 0;
  }
  const h = localHour(unixSeconds, a.timezone);
  const wraps = a.fromHour > a.toHour;
  const allHours = a.fromHour === a.toHour;

  if (!allHours) {
    const inHours = wraps ? h >= a.fromHour || h < a.toHour : h >= a.fromHour && h < a.toHour;
    if (!inHours) return false;
  }

  const days = validDays(a);
  if (!days.length || days.length === 7) return true;

  // The previous LOCAL day, by weekday arithmetic: stepping back 86400 s lands on the wrong day when the day
  // in between is 23 h (spring forward: Monday 00:30 would read as Saturday).
  const dow = localDayOfWeek(unixSeconds, a.timezone);
  return days.includes(wraps && h < a.toHour ? (dow + 6) % 7 : dow);
}

/** The last instant `nextAvailable` looks at the calendar for: Intl's last date (8.64e12 s) less the fortnight it
 *  may search ahead. */
const MAX_DATE_SECONDS = 8.64e12 - 30 * 86400;

/** Hours in a week (availabilitySchedule.ts WEEK_HOURS). */
const WEEK = 168;

/**
 * The earliest instant at or after `unixSeconds` that the player is available.
 *
 * Returns its input unchanged when that is already available, so callers can apply it
 * unconditionally.
 */
export function nextAvailable(unixSeconds: number, a: Availability): number {
  // Past the last date a calendar holds (Intl throws "Invalid time value" beyond 8.64e12 s), or not a time at all:
  // nothing to wait for. A bare farm continued as it is gets there (spec-buildfail, 30 Oct 2026: just after a
  // prestige, its TE waits ran for ages, the shift hold asked here, and the throw took the whole leg with it, the
  // build carried on included: "the ascension to 218 TE could not be simulated").
  if (!(Math.abs(unixSeconds) <= MAX_DATE_SECONDS)) return unixSeconds;
  if (!isConstrained(a) || isAvailable(unixSeconds, a)) return unixSeconds;
  // A daily window too goes by its week of hours (blockedArray builds it from the window): it used to step to the
  // next `fromHour` o'clock, which on the day the clocks go forward does not exist when the window starts in the
  // skipped hour, and landed up to an hour late (code review 22 Nov 2026, R2.3: 2 AM to 4 AM, 1:30 AM PST on
  // 14 Mar 2027 gave 3:30 AM, not 3:00 AM). No free hour in the week: the input back, rather than a hung search.
  if (!blockedArray(a)) return unixSeconds;
  return nextAvailableInWeek(unixSeconds, a);
}

/**
 * The next instant strictly after `tIn` at which the local hour of the week can change: the next local whole hour, or
 * a clock change before it (found to the quarter hour: every zone's offsets and changes are on quarter hours). On the
 * day the clocks go forward that is the hour after the skipped one; going back, the repeated hour comes round twice.
 */
function nextHourChange(tIn: number, tz: string): number {
  const t = Math.floor(tIn);
  const off = getTimezoneOffsetAt(tz, t);
  const wall = t + off;
  const cand = t + (3600 - (((wall % 3600) + 3600) % 3600));
  if (getTimezoneOffsetAt(tz, cand) === off) return cand;
  let q = Math.floor(t / 900) * 900 + 900;
  while (q < cand && getTimezoneOffsetAt(tz, q) === off) q += 900;
  return q;
}

/** `nextAvailable` for weekly hours. Usually no clock change lies ahead within the week: then the next free hour is found
 *  on the wall clock (the mask read as an array) and checked with one offset read at it. Across a clock change, walk
 *  the local hours (at most a week of them, plus the change) to the first free one. With no free hour in reach, the
 *  input back, as for the daily window. */
function nextAvailableInWeek(unixSeconds: number, a: Availability): number {
  const m = blockedArray(a)!.blocked;
  const t = Math.floor(unixSeconds);
  const off = getTimezoneOffsetAt(a.timezone, t);
  const wall = t + off;
  const hourStart = wall - (((wall % 3600) + 3600) % 3600);
  const dow = ((Math.floor(wall / 86400) % 7) + 4 + 7) % 7;
  const idx = weekIndex(dow, Math.floor((((wall % 86400) + 86400) % 86400) / 3600));
  for (let k = 1; k <= WEEK; k++) {
    if (m[(idx + k) % WEEK]) continue;
    const cand = hourStart + k * 3600 - off;
    // No clock change between here and there (an offset that changed and changed back within a week does not happen):
    // the wall-clock answer is the answer.
    if (getTimezoneOffsetAt(a.timezone, cand) === off) return cand;
    break;
  }
  let c = unixSeconds;
  for (let i = 0; i < 24 * 7 + 8; i++) {
    c = nextHourChange(c, a.timezone);
    if (isAvailable(c, a)) return c;
  }
  return unixSeconds;
}

/** How many of `timestamps` fall OUTSIDE the schedule. Used to report the part a schedule cannot
 *  fix: the twelve shifts inside an ascension, which the simulator places and this does not move. */
export function countUnavailable(timestamps: number[], a: Availability | null | undefined): number {
  if (!isConstrained(a)) return 0;
  let n = 0;
  for (const t of timestamps) if (!isAvailable(t, a)) n++;
  return n;
}

/**
 * `nextAvailable` on `a` as a function of the instant, remembered per UTC hour (the table replay asks
 * it for every shift of every checkpoint of every start: search/tableV2.ts `sweepReplay`). The hours
 * change only on local whole hours, which fall at most once in any UTC hour, so an hour whose first
 * and last seconds are both inside is inside throughout, and one whose two ends are both outside
 * waits for the same instant throughout; only an hour with a change in it is asked each time.
 * The same answers as `nextAvailable`, to the second.
 */
export function holdUntilOf(a: Availability): (t: number) => number {
  if (!isConstrained(a)) return t => t;
  // Per UTC hour: -1 inside throughout, -2 a change inside it, else the instant to wait for.
  const byHour = new Map<number, number>();
  return t => {
    const h = Math.floor(t / 3600);
    let v = byHour.get(h);
    if (v === undefined) {
      const s = h * 3600;
      const inS = isAvailable(s, a);
      const inE = isAvailable(s + 3599, a);
      v = inS && inE ? -1 : !inS && !inE ? nextAvailable(s, a) : -2;
      // A pattern with no hour at all gives its input back (nextAvailable): ask each time then.
      if (v === s) v = -2;
      byHour.set(h, v);
    }
    return v === -1 ? t : v === -2 ? nextAvailable(t, a) : v;
  };
}
