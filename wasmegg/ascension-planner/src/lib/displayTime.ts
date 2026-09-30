/**
 * Dates and hours as the PLAYER reads them.
 *
 * The browser's own format by default (`undefined` locale = the language and region the player set):
 * 12- or 24-hour clock as they use it, and the month spelled out, so no one has to guess whether
 * 03/04 is March or April. `iso` is the fixed `2027-03-18 11:15` some prefer. Display only: what is
 * stored, exported or sent (CSV, submissions, the plan start boxes) keeps its own fixed format.
 */
import { ref, watch } from 'vue';
import { formatInZone } from '@/search/csv';

export type DateStyle = 'local' | 'iso';
const KEY = 'aap.dateStyle';

function load(): DateStyle {
  try {
    return localStorage.getItem(KEY) === 'iso' ? 'iso' : 'local';
  } catch {
    return 'local';
  }
}

/** The player's choice, shared by every panel and remembered in this browser. */
export const dateStyle = ref<DateStyle>(typeof window === 'undefined' ? 'local' : load());
watch(dateStyle, v => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // a preference, not a reason to fail
  }
});

/** A moment, in `timezone`: "Mar 18, 2027, 11:15 AM" / "18 Mar 2027, 11:15", or ISO. '' when unknown. */
export function showDateTime(unixSeconds: number | undefined, timezone: string, style = dateStyle.value): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  if (style === 'iso') return formatInZone(unixSeconds, timezone);
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return formatInZone(unixSeconds, timezone);
  }
}

/** An hour of the day (0-23): "9:00 AM" / "09:00" by the player's clock, or "09:00". */
export function showHour(hour: number, style = dateStyle.value): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (style === 'iso') return `${String(h).padStart(2, '0')}:00`;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2020, 0, 1, h))
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** An awake-hours schedule in words, by the player's clock: "every day, 9:00 AM to 1:00 AM (next day)". */
export function showSchedule(
  a: { days: number[]; fromHour: number; toHour: number; timezone: string } | null | undefined,
  style = dateStyle.value
): string {
  if (!a) return 'any time';
  const days = [...new Set(a.days.filter(d => d >= 0 && d <= 6))].sort((x, y) => x - y);
  const dayText = !days.length || days.length === 7 ? 'every day' : days.map(d => DAYS[d]).join(', ');
  if (a.fromHour === a.toHour) return `${dayText}, all day (${a.timezone})`;
  const wraps = a.toHour < a.fromHour;
  return `${dayText}, ${showHour(a.fromHour, style)} to ${showHour(a.toHour, style)}${wraps ? ' (next day)' : ''} (${a.timezone})`;
}

/** A calendar day (`YYYY-MM-DD`, as the date boxes hold it): "Sep 29, 2026" / "29 Sep 2026", or as given. */
export function showDay(ymd: string, style = dateStyle.value): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m || style === 'iso') return ymd;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
