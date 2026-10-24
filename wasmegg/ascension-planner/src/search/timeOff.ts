/**
 * @module timeOff
 * @description Time off from the virtue farm, as the player types it: whole local dates.
 *
 * A stretch runs from the start of its first day to the start of the day after its last, in the
 * plan's own timezone -- "July 14" is the whole of Egg Day wherever the player is. What the chain
 * evaluator does with it is documented on `SearchInputs.timeOff`.
 */
import { getLocalTimestampInTimezone } from '@/lib/events';
import type { TimeOffWindow } from './types';

export interface TimeOffDates {
  /** First day away, `YYYY-MM-DD`. */
  from: string;
  /** Last day away, `YYYY-MM-DD`, inclusive. Same as `from` for a single day. */
  to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The day after `date`, as `YYYY-MM-DD`. Calendar arithmetic, so no timezone or DST can shift it. */
export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The stretches that are complete and the right way round, in date order. A half-typed row is
 *  ignored rather than guessed at. */
export function usableTimeOff(dates: TimeOffDates[] | null | undefined): TimeOffDates[] {
  return (dates ?? [])
    .filter(d => DATE.test(d.from) && DATE.test(d.to) && d.from <= d.to)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** The stretches as absolute windows in `tz`, overlapping ones merged. */
export function timeOffWindows(dates: TimeOffDates[] | null | undefined, tz: string): TimeOffWindow[] {
  const out: TimeOffWindow[] = [];
  for (const d of usableTimeOff(dates)) {
    const w = {
      from: getLocalTimestampInTimezone(d.from, '00:00', tz),
      to: getLocalTimestampInTimezone(nextDate(d.to), '00:00', tz),
    };
    const last = out[out.length - 1];
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to);
    else out.push(w);
  }
  return out;
}

/** `July 14` / `July 14 - 16, 2027`: for notes and the CSV header. */
export function describeTimeOff(dates: TimeOffDates[] | null | undefined): string {
  const list = usableTimeOff(dates);
  if (!list.length) return 'none';
  return list.map(d => (d.from === d.to ? d.from : `${d.from} to ${d.to}`)).join('; ');
}
