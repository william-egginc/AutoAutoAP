/**
 * Weekly hours (R10): the picker's helpers. Hours are indexes 0-167, Monday 00:00-01:00 first (Joo's
 * lib/instantSearch/blockedTime.ts); the picker edits the BLOCKED hours. Our day numbers are Sunday = 0.
 * WEEKLY_HOURS_WORDS is DRAFT wording for Words to check.
 */
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
const gridDay = (sunFirst: number) => (sunFirst + 6) % 7;

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
    const d = gridDay(day);
    if (w.fromHour === w.toHour) range(0, 24).forEach(h => awake.add(d * 24 + h));
    else if (w.fromHour < w.toHour) range(w.fromHour, w.toHour).forEach(h => awake.add(d * 24 + h));
    else {
      range(w.fromHour, 24).forEach(h => awake.add(d * 24 + h));
      range(0, w.toHour).forEach(h => awake.add(d * 24 + h));
    }
  }
  return range(0, 168).filter(i => !awake.has(i));
}

export const WEEKLY_HOURS_WORDS = {
  // DRAFT: Words to check.
  presets: { sleep: 'Sleep 11 PM–7 AM', work: 'Work 9–5 weekdays', daily: 'My daily hours' },
  clear: 'Clear all',
  help: (zone: string) =>
    `Click or drag across hours to block or unblock them. Hours are read in the time zone above (${zone}).`,
  count: (n: number) => `${n} hour${n === 1 ? '' : 's'} a week blocked.`,
};
