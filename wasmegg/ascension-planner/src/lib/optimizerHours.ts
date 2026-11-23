// Our weekly awake hours (R10) as the mission optimizer's one daily sleep window, and the plan's launches read back
// against the real hours. The solver takes a single sleep length a day and "hours since you woke" at the start
// (lib/mission-optimizer/schedule-settings.ts); the player's hours vary by weekday. So:
//   - every day the visit covers has the same awake hours (and they are one stretch): the window is exact;
//   - otherwise the window is the stretch awake on EVERY covered day, so a launch it allows is a launch the real
//     hours allow, and `note` says the days differ.
// The solver is untouched: this only builds the numbers it is already asked for. Kept free of the loot dataset.

import { getTimezoneOffsetAt } from 'lib/planners/events';
import { MAX_SLEEP_HOURS } from 'lib/mission-optimizer/schedule-settings';
import type { OptimizerSolution } from 'lib/mission-optimizer/types';

import { formatMoment } from '@/lib/clock';
import { isAvailable } from '@/search/availability';
import { blockedArray, isConstrained, type Availability } from '@/search/availabilitySchedule';

const HOUR = 3600;
// A week of hours covers every weekday; a longer visit repeats it.
const MAX_SAMPLE_HOURS = 8 * 24;

export interface AwakeWindow {
  /** Hours a day the solver is told to sleep, 0 when the visit never leaves the awake hours. */
  sleepHours: number;
  /** Hours since the wake-up when the plan starts (0 to under 24). */
  hoursSinceWake: number;
  /** Local hours of the day the awake stretch runs from and to (`to` is the hour after the last awake one). */
  awakeFrom: number;
  awakeTo: number;
  /** True when the window is exactly the player's hours on every day the visit covers. */
  exact: boolean;
  /** One line for the player when it is not exact; '' otherwise. */
  note: string;
}

function localWallSeconds(unixSeconds: number, timezone: string): number {
  const s = Math.floor(unixSeconds);
  return s + getTimezoneOffsetAt(timezone, s);
}

/**
 * The sleep window to plan a visit starting at `startUnix` and lasting `horizonSeconds` around, from the player's hours.
 * Null when there are no hours to plan around.
 */
export function awakeWindowFor(
  availability: Availability | null | undefined,
  startUnix: number,
  horizonSeconds: number
): AwakeWindow | null {
  if (!isConstrained(availability) || !blockedArray(availability)) return null;
  const hours = Math.min(MAX_SAMPLE_HOURS, Math.max(1, Math.ceil(horizonSeconds / HOUR)));

  // Per hour of the day: has it been sampled, and was it awake every time? Unsampled hours are never reached.
  const sampled = new Array<boolean>(24).fill(false);
  const always = new Array<boolean>(24).fill(true);
  const samples: { hod: number; awake: boolean }[] = [];
  // The solver counts fixed 24-hour days from the start, so an hour is read in that model's time (the start's hour of
  // the day plus the hours since), while whether the player is awake is read off the real clock at that instant. A
  // clock change inside the visit then shows up as hours that are not awake every time, and the window keeps clear of them.
  const startWall = localWallSeconds(startUnix, availability.timezone);
  const startIntoDay = (((startWall % 86400) + 86400) % 86400) / HOUR;
  for (let k = 0; k < hours; k++) {
    const t = startUnix + k * HOUR;
    const hod = Math.floor(startIntoDay + k) % 24;
    const awake = isAvailable(t, availability);
    sampled[hod] = true;
    if (!awake) always[hod] = false;
    samples.push({ hod, awake });
  }
  // Hours the visit never reaches are not asked of the player; they sit awake so they do not split a stretch.
  const usable = always.map((a, h) => a || !sampled[h]);

  // The longest stretch of awake hours around the clock; the earliest wins a tie.
  let best = { from: 0, len: 0 };
  const anyBlocked = usable.some(u => !u);
  if (!anyBlocked) best = { from: 0, len: 24 };
  else {
    for (let h = 0; h < 24; h++) {
      if (usable[h] && !usable[(h + 23) % 24]) {
        let len = 0;
        while (len < 24 && usable[(h + len) % 24]) len++;
        if (len > best.len) best = { from: h, len };
      }
    }
  }

  if (!anyBlocked) {
    return { sleepHours: 0, hoursSinceWake: 0, awakeFrom: 0, awakeTo: 0, exact: true, note: '' };
  }

  const sleepWanted = 24 - best.len;
  const sleepHours = Math.min(MAX_SLEEP_HOURS, sleepWanted);
  const awakeTo = (best.from + best.len) % 24;

  // Since the awake stretch began, at the start: the wall-clock hours into the day, from where the stretch starts.
  const since = Math.round((((startIntoDay - best.from) % 24) + 24) % 24 * 60) / 60;

  // Exact: every hour the visit reaches is awake exactly when it is in the stretch, on every day. An awake hour
  // outside it (a gap in the afternoon, a later start on one day) is one the plan cannot use.
  const withinCap = sleepWanted <= MAX_SLEEP_HOURS;
  const exact = withinCap && samples.every(s => s.awake === usable[s.hod]);

  // The clocks change between the start and the end of the visit.
  const endUnix = startUnix + hours * HOUR;
  const clocksChange =
    getTimezoneOffsetAt(availability.timezone, Math.floor(startUnix)) !==
    getTimezoneOffsetAt(availability.timezone, Math.floor(endUnix));

  let note = '';
  if (!withinCap) {
    note = `You are awake less than ${24 - MAX_SLEEP_HOURS} hours a day, so the plan allows at most ${MAX_SLEEP_HOURS} hours of sleep. A launch can still land in your hours off.`;
  } else if (!exact && clocksChange) {
    note = 'The clocks change during this visit, so the plan keeps clear of the hour that moves and every launch still falls in your awake hours.';
  } else if (!exact) {
    note = 'Your hours differ from day to day, so the plan uses only the hours you are awake on every day of this visit.';
  }
  return { sleepHours, hoursSinceWake: since, awakeFrom: best.from, awakeTo, exact, note };
}

/** A launch's moment as the player reads it: the plan start plus the offset, in the plan's zone, 12-hour ("Tue, Jan 5, 9:00 AM"). */
export function launchClock(startUnix: number, offsetSeconds: number, timezone: string): string {
  return formatMoment((startUnix + offsetSeconds) * 1000, { zone: timezone, weekday: true, year: 'never' });
}

/** How many of the solution's launches go up in an hour the player is not available. 0 with no hours. */
export function launchesInBlockedHours(
  solution: Pick<OptimizerSolution, 'slots'>,
  startUnix: number,
  availability: Availability | null | undefined
): number {
  if (!isConstrained(availability)) return 0;
  let n = 0;
  for (const slot of solution.slots ?? [])
    for (const launch of slot.launches) if (!isAvailable(startUnix + launch.launchAt, availability)) n++;
  return n;
}
