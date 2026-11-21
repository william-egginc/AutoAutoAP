/**
 * Weekly hours (R10): the picker's helpers. Hours are indexes 0-167, Monday 00:00-01:00 first (Joo's
 * lib/instantSearch/blockedTime.ts); the picker edits the BLOCKED hours, the same style as the core's
 * Availability.blocked (src/search/availabilitySchedule.ts, whose weekIndex is the one Sunday-first conversion).
 * WEEKLY_HOURS_WORDS is DRAFT wording for Words to check.
 */
import { WEEK_HOURS, weekIndex } from '@/search/availabilitySchedule';

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** "12 AM", "9 AM", "12 PM", "11 PM": 12-hour always. */
export function hourName(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

export type WeeklyPreset = 'sleep' | 'work';

export function presetHours(preset: WeeklyPreset): number[] {
  if (preset === 'sleep') return range(0, 7).flatMap(d => [23, ...range(0, 7)].map(h => d * 24 + h));
  return range(0, 5).flatMap(d => range(9, 17).map(h => d * 24 + h));
}

/** Today's single window as blocked hours: everything outside From to To on the days picked (Sunday = 0). */
export function dailyWindowHours(w: { fromHour: number; toHour: number; days: number[] }): number[] {
  const awake = new Set<number>();
  for (const day of w.days) {
    const hours =
      w.fromHour === w.toHour
        ? range(0, 24)
        : w.fromHour < w.toHour
          ? range(w.fromHour, w.toHour)
          : [...range(w.fromHour, 24), ...range(0, w.toHour)];
    for (const h of hours) awake.add(weekIndex(day, h));
  }
  return range(0, WEEK_HOURS).filter(i => !awake.has(i));
}

/** Words' wording (21 Nov 2026): the setting stays "My awake hours"; shaded hours are the ones you can't play. */
export const WEEKLY_HOURS_WORDS = {
  presets: { sleep: 'Sleep, 11 PM to 7 AM', work: 'Work, 9 AM to 5 PM on weekdays', daily: 'My daily hours' },
  dailyTitle: 'Fills the week from the awake hours you had before.',
  clear: 'Clear all',
  clearTitle: 'Make every hour one you can play.',
  help: (zone: string) =>
    `Press or drag across hours to mark them as hours you can't play, or to mark them free again. Times are in the time zone above (${zone}).`,
  /** n = hours a week you CAN play (168 minus the shaded ones). */
  count: (n: number) => (n === 1 ? '1 hour a week you can play.' : `${n} hours a week you can play.`),
  legend: { can: 'You can play', cant: "You can't play" },
  gridLabel: 'Your week, hour by hour',
  cellLabel: (day: string, hour: string, cant: boolean) => `${day} ${hour}: ${cant ? "can't play" : 'can play'}`,
};
