/** Weekly hours (R10) in the calendar feed: an event outside the player's hours is `quiet`, and the hours are now the
 *  week's (Availability.blocked), so a work-day morning is quiet and the same hour on Saturday is not. A daily window
 *  with chosen days is read as its mask, so its other days are quiet too (before R10 the days were dropped). */
import { describe, expect, it } from 'vitest';
import { inHours } from './calendarFeedEvents';
import { calHoursOf } from '@/composables/useCalendarFeed';
import { maskOfWindow, weekIndex } from '@/search/availabilitySchedule';

const tz = 'America/Los_Angeles';
const ms = (iso: string) => Date.parse(iso);
const WORK = [1, 2, 3, 4, 5].flatMap(d => [9, 10, 11, 12, 13, 14, 15, 16].map(h => weekIndex(d, h)));
const SLEEP_WORK = [...new Set([...maskOfWindow([], 7, 23), ...WORK])];

describe('calHoursOf and inHours with weekly hours', () => {
  it('a mask goes to the feed and is read by weekday and hour, DST included', () => {
    const h = calHoursOf({ days: [], fromHour: 7, toHour: 23, timezone: tz, blocked: SLEEP_WORK })!;
    expect(h.blocked).toEqual([...SLEEP_WORK].sort((a, b) => a - b));
    expect(inHours(ms('2026-11-24T18:30:00Z'), h, tz)).toBe(false); // Tue 10:30 AM: at work
    expect(inHours(ms('2026-11-28T18:30:00Z'), h, tz)).toBe(true); // Sat 10:30 AM
    expect(inHours(ms('2026-11-25T02:00:00Z'), h, tz)).toBe(true); // Tue 6 PM
    expect(inHours(ms('2027-03-14T14:30:00Z'), h, tz)).toBe(true); // Sun 7:30 AM PDT, the spring-forward day
    expect(inHours(ms('2027-03-14T13:30:00Z'), h, tz)).toBe(false); // Sun 6:30 AM PDT
  });
  it('a daily window with chosen days: the other days are quiet; every day: as before', () => {
    const wk = calHoursOf({ days: [1, 2, 3, 4, 5], fromHour: 18, toHour: 23, timezone: tz })!;
    expect(inHours(ms('2026-11-25T03:00:00Z'), wk, tz)).toBe(true); // Tue 7 PM
    expect(inHours(ms('2026-11-29T03:00:00Z'), wk, tz)).toBe(false); // Sat 7 PM
    const daily = calHoursOf({ days: [], fromHour: 7, toHour: 23, timezone: tz })!;
    expect(daily).toEqual({ start: '07:00', end: '23:00', timezone: tz });
  });
  it('a week with every hour blocked is no schedule: no hours', () => {
    expect(calHoursOf({ days: [], fromHour: 7, toHour: 23, timezone: tz, blocked: Array.from({ length: 168 }, (_, i) => i) })).toBeNull();
  });
});
