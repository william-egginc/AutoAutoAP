/**
 * THE ONE TIME STYLE for a clock time the page writes: each player's own (Jordan, 13 Nov 2026: "follow each person's
 * own device settings / Setup options", not a forced "9:00 AM"). The browser's language and region pick it, through
 * Intl's short time (the same locale source lib/clock.ts uses: the browser's when none is given):
 *   en-US "9:00 AM", "10:00 AM", "12:00 PM"; en-GB and de-DE "09:00", "21:05"; ja-JP "9:00"; en-AU "9:00 am".
 * Whole hours keep their minutes in every locale ("10:00 AM", never "10 AM"). Setup's "Show dates as" ISO choice
 * (lib/displayTime.ts `dateStyle`) gives the fixed 24-hour "09:00" for everyone who picked it. A range: "7:00 AM–1:00 AM"
 * / "07:00–01:00". A zone label goes after: "9:00 AM PT" / "09:00 PT".
 *
 * Every hard-coded writer goes through here (the awake hours in "Priced with ...", the Leaderboard's hour filters,
 * the Build-up tracker, the step-away and progress notes, the egg-beta reload banner, the Leaderboard's dates).
 * Nothing reads these strings back: a caller that needs the hour keeps the number (lib/pricedWith.ts `hoursShort`,
 * lib/nowWords.ts `setupSummary`). `locale` is for specs (the browser's when unset); `iso` forces or turns off the
 * ISO choice (Setup's when unset). src/lib/timeStyle.spec.ts keeps the old hand-made styles out of src.
 *
 * A *Words.ts file: not a result-code hash input (lib/resultCodeHash.ts `isWordingOnly`). No Vue of its own: it only
 * reads Setup's choice (a ref), so a page drawing a time follows that choice.
 */
import { dateStyle } from './displayTime';

export interface ClockOptions {
  /** A zone label put after the time ("PT"). */
  zone?: string;
  /** Specs only: the language to format in; the browser's when unset. */
  locale?: string;
  /** The fixed 24-hour "09:00" (Setup's ISO choice); Setup's choice when unset. */
  iso?: boolean;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** The locale's own short time ("9:00 AM", "09:00", "9:00 am") in IANA `timeZone`; null for a zone it doesn't know. */
function localeTime(locale: string | undefined, timeZone: string): Intl.DateTimeFormat | null {
  const key = `${locale ?? ''}|${timeZone}`;
  if (!formatters.has(key)) {
    let f: Intl.DateTimeFormat | null;
    try {
      f = new Intl.DateTimeFormat(locale, { timeZone, timeStyle: 'short' });
    } catch {
      f = null;
    }
    formatters.set(key, f);
  }
  return formatters.get(key)!;
}

/** Intl's narrow and no-break spaces as plain ones, so "9:00 AM" reads (and searches) the same in every engine. */
function plainSpaces(s: string): string {
  return s.replace(/[  ]/g, ' ');
}

function isoOf(o: ClockOptions): boolean {
  return o.iso ?? dateStyle.value === 'iso';
}

/** "09:05": the ISO choice's fixed 24-hour time. */
function iso24(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Hours 0-23 (wrapped) and minutes in the player's style: "8:00 AM" / "08:00"; `zone` is a label put after. */
export function formatClockTime(hour: number, minute = 0, o: ClockOptions = {}): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = ((Math.floor(minute) % 60) + 60) % 60;
  const f = isoOf(o) ? null : localeTime(o.locale, 'UTC');
  const s = f ? plainSpaces(f.format(Date.UTC(2020, 0, 1, h, m))) : iso24(h, m);
  return o.zone ? `${s} ${o.zone}` : s;
}

/** Two whole hours as a range: "7:00 AM–1:00 AM" / "07:00–01:00" (`sep` " to " for a sentence). */
export function formatClockRange(fromHour: number, toHour: number, o: ClockOptions & { sep?: string } = {}): string {
  const one = { locale: o.locale, iso: o.iso };
  const s = `${formatClockTime(fromHour, 0, one)}${o.sep ?? '–'}${formatClockTime(toHour, 0, one)}`;
  return o.zone ? `${s} ${o.zone}` : s;
}

/** The clock time of an instant (epoch ms) in `zone` (the viewer's own when unset), to its minute: "3:07 AM" / "03:07".
 *  '' when it can't be read (an unknown zone). */
export function clockTimeOf(ms: number, zone?: string, o: Omit<ClockOptions, 'zone'> = {}): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(Math.floor(ms / 60_000) * 60_000);
  if (isNaN(d.getTime())) return '';
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The ISO choice: the locale's own short time in a fixed 24-hour one (en-GB writes "09:05").
  const f = localeTime(isoOf(o) ? 'en-GB' : o.locale, tz);
  return f ? plainSpaces(f.format(d)) : '';
}

/**
 * Text an Intl formatter wrote in 12-hour English ("14 Jul 2026, 09:00 am", "9 p.m."), each clock time in it put into
 * the player's style: "9:00 AM" in en-US, "09:00" in en-GB or de-DE, minutes always.
 */
export function inTimeStyle(text: string, o: Omit<ClockOptions, 'zone'> = {}): string {
  return text.replace(
    /\b(\d{1,2})(?::(\d{2}))?[\s  ]*([AaPp])\.?[Mm]\.?(?![A-Za-z])/g,
    (_m, h: string, m: string | undefined, ap: string) => {
      const hour = Number(h) % 12;
      return formatClockTime(ap.toLowerCase() === 'p' ? hour + 12 : hour, m ? Number(m) : 0, o);
    }
  );
}
