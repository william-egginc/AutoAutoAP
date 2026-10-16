/**
 * An upcoming (or past) event the way a player reads it on the My runs "Right now" card (Jordan, 17 Oct):
 * the calendar day, the clock time and how far away it is, all at once:
 *   "today at 2:40 pm, in 1 h 20 m" · "tomorrow at 9:00 am, in 18 h" · "Oct 20 at 4:00 pm, in 2 days" ·
 *   "Jul 14 at 11:25 pm, in 271 days" · "today at 11:05 am, 3 h ago".
 * Pure: `now` is a parameter, the zone is the planner's, the clock is 12-hour am/pm like the rest of the app.
 */

const DAY = 86400;

export interface EventWhen {
  /** 'today' | 'tomorrow' | 'yesterday' | 'Oct 20' (the year only when it is not this year: 'Oct 20, 2027'). */
  day: string;
  /** '2:40 pm'. */
  clock: string;
  /** 'in 1 h 20 m' · 'in 2 days' · '3 h ago' · 'now'. */
  relative: string;
  /** Seconds from now (negative: past). */
  seconds: number;
}

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  period: string;
  ymd: string;
}

function partsOf(unixSeconds: number, zone: string): Parts {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(new Date(unixSeconds * 1000))
      .map(x => [x.type, x.value])
  ) as Record<string, string>;
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(unixSeconds * 1000)
  );
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    period: (p.dayPeriod || '').toLowerCase(),
    ymd,
  };
}

/** The calendar-day distance between two moments in `zone` (0 = the same day). */
function dayDistance(a: Parts, b: Parts): number {
  const t = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000;
  return Math.round(t(a.ymd) - t(b.ymd));
}

/** 'in 1 h 20 m', 'in 18 h', 'in 33 h' (hours up to 2 days), 'in 2 days', '45 min ago', '30 h ago', 'now'. */
export function relativeWords(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return 'now';
  let body: string;
  if (abs < 3600) body = `${Math.round(abs / 60)} min`;
  else if (abs < DAY) {
    const h = Math.floor(abs / 3600);
    const m = Math.round((abs - h * 3600) / 60);
    body = m === 0 || m === 60 ? `${m === 60 ? h + 1 : h} h` : `${h} h ${m} m`;
  } else if (abs < 2 * DAY) {
    // Under two days, hours (Jordan, 16 Oct: "in 1 day" for 33 h hid most of a day).
    body = `${Math.round(abs / 3600)} h`;
  } else {
    const d = Math.floor(abs / DAY);
    body = `${d} day${d === 1 ? '' : 's'}`;
  }
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
          : `${p.month} ${p.day}${p.year !== n.year ? `, ${p.year}` : ''}`;
  const seconds = at - nowSeconds;
  return { day, clock: `${p.hour}:${p.minute} ${p.period}`.trim(), relative: relativeWords(seconds), seconds };
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
    const p = partsOf(at, zone);
    const n = partsOf(nowSeconds, zone);
    const wd = weekday
      ? `${new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(new Date(at * 1000))}, `
      : '';
    return `${wd}${p.month} ${p.day}${p.year !== n.year ? `, ${p.year}` : ''} at ${p.hour}:${p.minute} ${p.period}`;
  } catch {
    return '';
  }
}

/** "3 hours ago", "45 minutes ago", "1 hour ago", "3 days ago", "just now" (the save-age strip's words). */
export function agoLong(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return 'just now';
  if (s < 3600) {
    const m = Math.round(s / 60);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (s < 48 * 3600) {
    const h = Math.round(s / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(s / DAY);
  return `${d} days ago`;
}
