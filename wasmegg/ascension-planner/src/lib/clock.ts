/**
 * The one clock every player-facing date and time goes through (UX review, 25 Oct 2026). It follows the
 * browser's own language and region (Jordan, 25 Oct: "defer to the browser's locale, but consistently"): the
 * 12- or 24-hour clock as the player uses it, and the month spelled short, so no one has to guess whether 03/04
 * is March or April. Before this, panels mixed the browser's "3:00 AM", a forced "6:00 pm" and a forced
 * "14 July … 9:00 AM" on one account.
 *
 * In en-US:
 *   formatMoment(ms, { zone })                                   "Jul 14, 2027, 9:00 AM"
 *   formatMoment(ms, { zone, weekday: true, year: 'never' })     "Sat, Oct 24, 9:47 PM"
 *   formatMoment(ms, { zone, at: true, year: 'auto' })           "Oct 24 at 9:47 PM" (this year)
 *   formatMoment(ms, { zone, dateOnlyWhenFar: true })            "Jun 7, 2032" (over a year away)
 *   formatClock(ms, zone)                                        "9:47 PM"   (de-DE: "21:47")
 *   formatHourOfDay(9)                                           "9:00 AM"   (de-DE: "9:00")
 *
 * `locale` is for specs only (the browser's when unset). Pure (no Vue, no storage), so the stores and the search
 * harness can use it. Not for what is stored, exported or sent (CSV, submissions, the date boxes): those keep
 * their own fixed formats.
 */

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** A cached formatter; null for an unknown zone (RangeError), remembered so a bad zone costs one throw. */
function formatter(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  const key = `${locale ?? ''}|${JSON.stringify(opts)}`;
  if (!formatters.has(key)) {
    let f: Intl.DateTimeFormat | null;
    try {
      f = new Intl.DateTimeFormat(locale, opts);
    } catch {
      f = null;
    }
    formatters.set(key, f);
  }
  return formatters.get(key)!;
}

/** `ms` as a Date, or null past what a Date can hold. */
function dateOf(ms: number): Date | null {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

/** Calendar year, day and 0-23 hour of `ms` in `zone`: the comparisons behind 'auto' years, "today" and grids,
 *  never shown. Null for an unknown zone. */
export function calendarOf(ms: number, zone?: string): { year: number; ymd: string; hour: number } | null {
  const d = dateOf(ms);
  const f = formatter('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  if (!d || !f) return null;
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { year: Number(p.year), ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

const YEAR_MS = 365 * 86400 * 1000;

export interface MomentOptions {
  /** IANA zone; this browser's when unset. */
  zone?: string;
  /** The weekday with the date ("Sat, Oct 24"). */
  weekday?: boolean;
  /** 'always' (the default), 'never', or 'auto': only when it is not `now`'s year. */
  year?: 'always' | 'never' | 'auto';
  /** Leave the time of day off. */
  dateOnly?: boolean;
  /** Leave the time of day off when the moment is more than a year from `now`: a finish date years ahead to
   *  the minute promises more than it can hold. Only for summaries and lists, never a deadline, a stop or a
   *  prestige time, where the hour is what the player acts on. */
  dateOnlyWhenFar?: boolean;
  /** The hour alone when it is on the hour ("4 PM"), for the compact route lines. */
  shortTime?: boolean;
  /** " at " between the date and the time, for a sentence ("Oct 24 at 9:47 PM"). */
  at?: boolean;
  /** The zone's short name with the time ("PDT"). */
  zoneName?: boolean;
  /** Epoch ms for `year: 'auto'` and `dateOnlyWhenFar`; now when unset. */
  now?: number;
  /** Specs only: the language to format in; the browser's when unset. */
  locale?: string;
}

/** A moment as the player reads it (see the top of the file). '' when it can't be read. */
export function formatMoment(ms: number, o: MomentOptions = {}): string {
  const d = dateOf(ms);
  if (!d) return '';
  const now = o.now ?? Date.now();
  let withYear = o.year !== 'never';
  if (o.year === 'auto') {
    const a = calendarOf(ms, o.zone);
    const b = calendarOf(now, o.zone);
    withYear = !a || !b || a.year !== b.year;
  }
  const dateOnly = o.dateOnly || (o.dateOnlyWhenFar && Math.abs(ms - now) > YEAR_MS);
  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: o.zone,
    ...(o.weekday ? { weekday: 'short' } : {}),
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'short',
    day: 'numeric',
  };
  if (dateOnly) return formatter(o.locale, dateOpts)?.format(d) ?? '';
  const timeOpts = timeOptions(d, o);
  if (o.at) {
    const date = formatter(o.locale, dateOpts)?.format(d);
    const time = formatter(o.locale, timeOpts)?.format(d);
    return date && time ? `${date} at ${time}` : '';
  }
  return formatter(o.locale, { ...dateOpts, ...timeOpts })?.format(d) ?? '';
}

function timeOptions(d: Date, o: Pick<MomentOptions, 'zone' | 'shortTime' | 'zoneName' | 'locale'>): Intl.DateTimeFormatOptions {
  const onTheHour = o.shortTime && d.getUTCSeconds() === 0 && minuteIn(d, o.zone) === 0;
  return {
    timeZone: o.zone,
    hour: 'numeric',
    ...(onTheHour ? {} : { minute: '2-digit' }),
    ...(o.zoneName ? { timeZoneName: 'short' } : {}),
  };
}

function minuteIn(d: Date, zone: string | undefined): number {
  const f = formatter('en-US', { timeZone: zone, minute: 'numeric' });
  return f ? Number(f.formatToParts(d).find(x => x.type === 'minute')?.value) : NaN;
}

/** The time of day of `ms` in `zone`: "9:47 PM" / "21:47". '' when it can't be read. */
export function formatClock(ms: number, zone?: string, locale?: string): string {
  const d = dateOf(ms);
  return (d && formatter(locale, timeOptions(d, { zone }))?.format(d)) || '';
}

/** An hour of the day (0-23, wrapped): "9:00 AM" / "09:00". */
export function formatHourOfDay(hour: number, locale?: string): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return formatClock(Date.UTC(2020, 0, 1, h), 'UTC', locale);
}

/** The short weekday of `ms` in `zone`: "Sat" / "Sa.". '' when it can't be read. */
export function formatWeekday(ms: number, zone?: string, locale?: string): string {
  const d = dateOf(ms);
  return (d && formatter(locale, { timeZone: zone, weekday: 'short' })?.format(d)) || '';
}
