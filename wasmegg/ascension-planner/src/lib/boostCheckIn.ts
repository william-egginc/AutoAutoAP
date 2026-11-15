/**
 * THE BUILD-UP TRACKER'S 2X LINE (Jordan, 15 Nov 2026; game expert): the weekly 2x earnings boost runs Monday 9:00 AM to
 * Tuesday 9:00 AM Pacific (lib/planners/events.ts). Away earnings take the multiplier active when the player CHECKS IN:
 * check in at or just after the start and the whole away stretch is paid at 2x; leave during it and come back after it
 * ends and none of it is. So while a 2x is on now, or starts before the plan's end, the tracker says when to check in and
 * when to collect by. Words: lib/boostCheckInWords.ts. Component-only (never lib/buildUpTracker.ts, a hash input).
 */
import { getNextEarningsBoostEnd, getNextEarningsBoostStart, isEarningsBoostActive } from 'lib/planners/events';

export interface BoostCheckIn {
  /** Monday 9:00 AM Pacific, unix seconds (the current 2x's start when `active`). */
  start: number;
  /** Tuesday 9:00 AM Pacific, unix seconds. */
  end: number;
  /** The 2x is on now. */
  active: boolean;
}

/** The 2x to tell the player about: on now, or starting after `now` and before the plan's end `until`; else null. */
export function boostCheckIn(now: number, until: number | null | undefined): BoostCheckIn | null {
  if (!Number.isFinite(now) || until == null || !Number.isFinite(until) || until <= now) return null;
  if (isEarningsBoostActive(now)) {
    const end = getNextEarningsBoostEnd(now);
    return { start: end - 86400, end, active: true };
  }
  const start = getNextEarningsBoostStart(now);
  if (start >= until) return null;
  return { start, end: getNextEarningsBoostEnd(start), active: false };
}
