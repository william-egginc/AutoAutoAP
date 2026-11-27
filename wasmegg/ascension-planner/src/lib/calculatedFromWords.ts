/**
 * The Right now line "Calculated from your Nov 11, 10:29 AM save at Nov 12, 3:40 PM" (Jordan's shape, 12 Nov 2026). The
 * times are written with a comma, not " at ", so the two "at"s never meet. A save from the same day as now drops the dates:
 * "Calculated from your 10:29 AM save at 3:40 PM". The year shows only when it isn't now's year.
 *
 * A *Words.ts file: wording only, never part of the result code hash.
 */
import { calendarOf, formatClock, formatMoment } from './clock';

/** `saveSeconds` / `nowSeconds`: epoch seconds; `zone`: IANA zone (the browser's when unset). '' when the save time is unknown. */
export function calculatedFromLine(o: { saveSeconds: number | null | undefined; nowSeconds: number; zone?: string }): string {
  if (!o.saveSeconds || !Number.isFinite(o.saveSeconds)) return '';
  const a = o.saveSeconds * 1000;
  const b = o.nowSeconds * 1000;
  const sameDay = calendarOf(a, o.zone)?.ymd === calendarOf(b, o.zone)?.ymd;
  const when = (ms: number) =>
    sameDay ? formatClock(ms, o.zone) : formatMoment(ms, { zone: o.zone, year: 'auto', now: b });
  return `Calculated from your ${when(a)} save at ${when(b)}`;
}
