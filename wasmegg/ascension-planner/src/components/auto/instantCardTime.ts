/**
 * THE INSTANT CARD'S TIMES (Jordan, 12 Nov 2026 pm, phone proposal question 4): without the year when it is this year
 * ("Nov 18, 2:46 PM"; "Jan 1, 2027, 7:00 AM" keeps it), so a time and what follows it stay on one line at 390 px. The
 * card's own formatter on lib/clock.ts `formatMoment` with `year: 'auto'`: lib/clock.ts and lib/displayTime.ts are
 * result-code-hash inputs and are not edited (this file is under src/components, never an input). ISO style as before
 * (the full date, lib/displayTime.ts showDateTime). Used by InstantRoute.vue (the saved line, the box label, First step)
 * and InstantSteps.vue (When each step happens). A sentence behind a "?" keeps the full date.
 */
import { formatMoment } from '@/lib/clock';
import { dateStyle, showDateTime, type DateStyle } from '@/lib/displayTime';

export function cardTime(
  unix: number,
  zone: string,
  o: { at?: boolean; now?: number; locale?: string; style?: DateStyle } = {}
): string {
  const style = o.style ?? dateStyle.value;
  if (style === 'iso') return showDateTime(unix, zone, style);
  return formatMoment(unix * 1000, { zone, year: 'auto', at: o.at, now: o.now, locale: o.locale }) || showDateTime(unix, zone, style);
}
