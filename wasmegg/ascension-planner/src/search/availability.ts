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
 *   - The delay is charged in full, and the TE you keep earning while away is NOT credited. Once
 *     the target is hit the farm goes on laying, so in real life you come back slightly past the
 *     checkpoint and the next leg is slightly shorter. The model is therefore CONSERVATIVE: a plan
 *     built with a schedule will, if anything, run marginally faster than it says.
 *
 * Setting a schedule changes what "best" means, so it is part of the run fingerprint (see
 * persistence.ts) and there is none by default. Chains scored with and without one are not
 * comparable, and every accuracy figure on record was measured without one.
 */
import { getTimezoneOffsetAt } from '@/lib/events';
import { isConstrained, validDays, type Availability } from './availabilitySchedule';

// The schedule's shape lives in availabilitySchedule.ts, which does not import lib/events (and so
// not its Pacific-time table). Re-exported so every existing importer keeps working. A module the
// Chain Explorer reaches must import from that file directly: see its header.
export {
  availabilityKey,
  describeAvailability,
  fromSleepHours,
  isConstrained,
  type Availability,
} from './availabilitySchedule';

/** Local hour-of-day, 0-23. One Intl call via `getTimezoneOffsetAt`, which is DST-exact — the
 *  offset is resolved AT that instant rather than assumed constant. */
export function localHour(unixSeconds: number, timezone: string): number {
  const wall = unixSeconds + getTimezoneOffsetAt(timezone, unixSeconds);
  return Math.floor((((wall % 86400) + 86400) % 86400) / 3600);
}

/** Local day of week, 0 = Sunday. 1970-01-01 was a Thursday, hence the +4. */
export function localDayOfWeek(unixSeconds: number, timezone: string): number {
  const wall = unixSeconds + getTimezoneOffsetAt(timezone, unixSeconds);
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
  const h = localHour(unixSeconds, a.timezone);
  const wraps = a.fromHour > a.toHour;
  const allHours = a.fromHour === a.toHour;

  if (!allHours) {
    const inHours = wraps ? h >= a.fromHour || h < a.toHour : h >= a.fromHour && h < a.toHour;
    if (!inHours) return false;
  }

  const days = validDays(a);
  if (!days.length || days.length === 7) return true;

  const sessionStart = wraps && h < a.toHour ? unixSeconds - 86400 : unixSeconds;
  return days.includes(localDayOfWeek(sessionStart, a.timezone));
}

/**
 * The next instant strictly after `t` whose local time is exactly `hour:00`.
 *
 * Deliberately NOT `getNextTimeInTimezone` from lib/events. That helper resolves the zone offset at
 * its own GUESSED UTC instant, so on a spring-forward day it lands an hour late: asking for 07:00 on
 * 2027-03-14 in America/Denver returns 08:00 MDT, because the offset is read at 07:00 UTC, still MST
 * and before the 02:00 transition. Harmless where it is used today (whole-hour plan starts a user
 * typed), wrong here, where the result is the thing being minimised.
 */
function nextLocalHour(t: number, hour: number, tz: string): number {
  const wall = t + getTimezoneOffsetAt(tz, t);
  const intoDay = ((wall % 86400) + 86400) % 86400;
  let delta = hour * 3600 - intoDay;
  // Strictly after: standing exactly on the target means the NEXT one is tomorrow's.
  if (delta <= 0) delta += 86400;
  let out = t + delta;

  // Correct for a transition crossed on the way. Offsets move by an hour (45 minutes in a couple of
  // zones), so two rounds is ample; the third is insurance, not a real case.
  for (let i = 0; i < 3; i++) {
    const h = localHour(out, tz);
    if (h === hour) break;
    let diff = hour - h;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    out += diff * 3600;
  }
  return out > t ? out : t + 3600;
}

/**
 * The earliest instant at or after `unixSeconds` that the player is available.
 *
 * Returns its input unchanged when that is already available, so callers can apply it
 * unconditionally.
 */
export function nextAvailable(unixSeconds: number, a: Availability): number {
  if (!isConstrained(a) || isAvailable(unixSeconds, a)) return unixSeconds;

  // Every session begins at `fromHour`, so those are the only candidate instants. Fourteen covers
  // a fortnight, which is more than enough for any weekly pattern that has any available day at
  // all; a pattern with none would loop forever without the bound.
  let c = unixSeconds;
  for (let i = 0; i < 14; i++) {
    c = nextLocalHour(c, a.fromHour, a.timezone);
    if (isAvailable(c, a)) return c;
  }
  // Give up rather than spin. A caller that gets its input back is no worse off than one with no
  // schedule at all, which is strictly better than a hung search.
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
