/**
 * An upcoming (or past) event the way a player reads it on the My runs "Right now" card (Jordan, 17 Oct):
 * the calendar day, the clock time and how far away it is, all at once:
 *   "today at 2:40 pm, in 1h 20m" · "tomorrow at 9:00 am, in 18h" · "Oct 20 at 4:00 pm, in 2d 4h" ·
 *   "Jul 14 at 11:25 pm, in 271d" · "today at 11:05 am, 3h ago".
 * Pure: `now` is a parameter, the zone is the planner's; dates and clock times in the browser's own format, like
 * the rest of the app (lib/clock.ts). The examples here are en-US's, which writes "2:40 PM".
 */

import { calendarOf, formatClock, formatMoment } from './clock';
import { compactDuration } from './duration';


export interface EventWhen {
  /** 'today' | 'tomorrow' | 'yesterday' | 'Oct 20' (the year only when it is not this year: 'Oct 20, 2027'). */
  day: string;
  /** '2:40 pm'. */
  clock: string;
  /** 'in 1h 20m' · 'in 2d 4h' · '3h ago' · 'now'. */
  relative: string;
  /** Seconds from now (negative: past). */
  seconds: number;
}

interface Parts {
  ms: number;
  ymd: string;
}

function partsOf(unixSeconds: number, zone: string): Parts {
  const c = calendarOf(unixSeconds * 1000, zone);
  if (!c) throw new RangeError(`unreadable moment in ${zone}`);
  return { ms: unixSeconds * 1000, ymd: c.ymd };
}

/** The calendar-day distance between two moments in `zone` (0 = the same day). */
function dayDistance(a: Parts, b: Parts): number {
  const t = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000;
  return Math.round(t(a.ymd) - t(b.ymd));
}

/** 'in 1h 20m', 'in 18h', 'in 33h' (hours up to 2 days), 'in 2d 4h', '45m ago', '30h ago', 'now' (lib/duration). */
export function relativeWords(seconds: number): string {
  if (Math.abs(seconds) < 60) return 'now';
  const body = compactDuration(seconds);
  return seconds > 0 ? `in ${body}` : `${body} ago`;
}

/** The pieces; '' day/clock when `at` is unknown. */
export function eventWhen(at: number | null | undefined, nowSeconds: number, zone: string): EventWhen | null {
  if (!at || !Number.isFinite(at)) return null;
  let p: Parts;
  let n: Parts;
  try {
    p = partsOf(at, zone);
    n = partsOf(nowSeconds, zone);
  } catch {
    return null;
  }
  const dd = dayDistance(p, n);
  const day =
    dd === 0
      ? 'today'
      : dd === 1
        ? 'tomorrow'
        : dd === -1
          ? 'yesterday'
          : formatMoment(p.ms, { zone, dateOnly: true, year: 'auto', now: n.ms });
  const seconds = at - nowSeconds;
  return { day, clock: formatClock(p.ms, zone), relative: relativeWords(seconds), seconds };
}

/** "today at 2:40 pm, in 1 h 20 m". '' when unknown. */
export function eventWhenText(at: number | null | undefined, nowSeconds: number, zone: string): string {
  const w = eventWhen(at, nowSeconds, zone);
  return w ? `${w.day} at ${w.clock}, ${w.relative}` : '';
}

/**
 * The calendar date and clock, never "today": "Oct 15 at 2:36 pm", with the weekday ("Thu, Oct 15 at 4:00 pm")
 * when asked and the year only when it is not `nowSeconds`'s ("Jul 13, 2027 at 5:14 pm"). '' when unknown. My
 * runs' events table and every "calculated …" / "from your save of …" line.
 */
export function dateAt(at: number | null | undefined, nowSeconds: number, zone: string, weekday = false): string {
  if (!at || !Number.isFinite(at)) return '';
  try {
    return formatMoment(at * 1000, { zone, weekday, year: 'auto', now: nowSeconds * 1000, at: true });
  } catch {
    return '';
  }
}

/**
 * A calendar day with its year, month first: "Feb 10, 2027" (Jordan, 24 Oct 2026: never "10 Feb 2027"). '' when
 * unknown. My runs' By a date goal names ("By Feb 10, 2027") and finish days.
 */
export function dayWords(at: number | null | undefined, zone: string): string {
  if (!at || !Number.isFinite(at)) return '';
  try {
    return formatMoment(at * 1000, { zone, dateOnly: true });
  } catch {
    return '';
  }
}

/** The day with its year and the 12-hour clock: "Feb 10, 2027 at 2:36 pm". '' when unknown. My runs' tooltips. */
export function dayClockWords(at: number | null | undefined, zone: string): string {
  if (!at || !Number.isFinite(at)) return '';
  try {
    return formatMoment(at * 1000, { zone, at: true });
  } catch {
    return '';
  }
}

/** "3h ago", "45m ago", "3d 2h ago", "just now" (the save-age strip's words; lib/duration). */
export function agoLong(seconds: number): string {
  const s = Math.max(0, seconds);
  return s < 60 ? 'just now' : `${compactDuration(s)} ago`;
}

/**
 * The day and the 12-hour clock for a sentence: "Oct 23 at 6:43 pm", with the year ("Oct 23, 2027 at 6:43 pm") only
 * when it isn't the year of `nowSeconds` in `zone`. '' when unknown.
 */
export function dayClockShort(at: number | null | undefined, nowSeconds: number, zone: string): string {
  if (!at || !Number.isFinite(at)) return '';
  try {
    return formatMoment(at * 1000, { zone, year: 'auto', now: nowSeconds * 1000, at: true });
  } catch {
    return '';
  }
}
