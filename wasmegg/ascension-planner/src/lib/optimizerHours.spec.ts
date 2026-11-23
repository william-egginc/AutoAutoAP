/**
 * Our weekly awake hours as the optimizer's one daily sleep window (Jordan, 22 Nov 2026: "get it working with our
 * hours ... works with your sleep"). Exact when every day the visit covers has the same awake hours; otherwise the
 * hours awake on every one of those days, with a note. All in January, so no clock change is in the way.
 */
import { describe, expect, it } from 'vitest';
import type { Availability } from '@/search/availabilitySchedule';
import { weekIndex } from '@/search/availabilitySchedule';
import { awakeWindowFor, launchClock, launchesInBlockedHours } from './optimizerHours';

const DAY = 86400;
// Monday 4 Jan 2027, 12:00 UTC.
const MON_NOON = Date.UTC(2027, 0, 4, 12, 0) / 1000;
const daily = (fromHour: number, toHour: number): Availability => ({
  days: [],
  fromHour,
  toHour,
  timezone: 'UTC',
});
/** Awake 7 AM to 11 PM, except that on Saturday and Sunday the morning starts at 10. */
const lateWeekend = (): Availability => {
  const blocked: number[] = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) {
      const weekend = d === 0 || d === 6;
      if (h < (weekend ? 10 : 7) || h >= 23) blocked.push(weekIndex(d, h));
    }
  return { days: [], fromHour: 7, toHour: 23, timezone: 'UTC', blocked };
};

describe('awakeWindowFor', () => {
  it('nothing when no hours are set', () => {
    expect(awakeWindowFor(null, MON_NOON, 3 * DAY)).toBeNull();
    expect(awakeWindowFor(daily(7, 7), MON_NOON, 3 * DAY)).toBeNull();
  });

  it('one daily window: exact, 8 hours of sleep, 5 hours since the 7 AM wake-up', () => {
    const w = awakeWindowFor(daily(7, 23), MON_NOON, 3 * DAY)!;
    expect(w).toMatchObject({ sleepHours: 8, hoursSinceWake: 5, exact: true, awakeFrom: 7, awakeTo: 23 });
    expect(w.note).toBe('');
  });

  it('minutes into the hour count: 12:30 is 5.5 hours since 7 AM', () => {
    expect(awakeWindowFor(daily(7, 23), MON_NOON + 30 * 60, 3 * DAY)!.hoursSinceWake).toBe(5.5);
  });

  it('a window past midnight: 6 PM to 2 AM is 16 hours of sleep... capped, so the 8 awake hours hold', () => {
    const w = awakeWindowFor(daily(18, 2), MON_NOON, 2 * DAY)!;
    expect(w).toMatchObject({ sleepHours: 16, awakeFrom: 18, awakeTo: 2, exact: true });
    // 12:00 is 18 hours since the 18:00 wake-up of the day before.
    expect(w.hoursSinceWake).toBe(18);
  });

  it('hours that differ by day: a visit that only covers weekdays is still exact', () => {
    const w = awakeWindowFor(lateWeekend(), MON_NOON, 2 * DAY)!;
    expect(w).toMatchObject({ sleepHours: 8, exact: true, awakeFrom: 7 });
  });

  it('hours that differ by day: a visit over the weekend plans around the hours awake on every day, with a note', () => {
    const w = awakeWindowFor(lateWeekend(), MON_NOON, 6 * DAY)!;
    expect(w).toMatchObject({ sleepHours: 11, exact: false, awakeFrom: 10, awakeTo: 23 });
    expect(w.note).toMatch(/differ/i);
    expect(w.note).toBe('Your hours differ from day to day, so the plan uses only the hours you are awake on every day of this visit.');
  });

  it('a short visit inside the awake hours needs no sleep window at all', () => {
    const w = awakeWindowFor(daily(7, 23), MON_NOON, 6 * 3600)!;
    expect(w.sleepHours).toBe(0);
    expect(w.exact).toBe(true);
  });

  it('fewer than 8 awake hours: sleep is held to 16 and the plan is not exact', () => {
    const w = awakeWindowFor(daily(9, 15), MON_NOON, 3 * DAY)!;
    expect(w.sleepHours).toBe(16);
    expect(w.exact).toBe(false);
    expect(w.note).toMatch(/16/);
    expect(w.note).toBe('You are awake less than 8 hours a day, so the plan allows at most 16 hours of sleep. A launch can still land in your hours off.');
  });
});

describe('launches against the real hours', () => {
  const solution = (launchAts: number[]) =>
    ({ slots: [{ launches: launchAts.map(launchAt => ({ choice: 0, launchAt })) }] }) as never;

  it('launchClock: the plan start plus the offset, in the plan zone, 12-hour', () => {
    expect(launchClock(MON_NOON, 0, 'UTC')).toMatch(/Mon.*12:00 PM/);
    expect(launchClock(MON_NOON, 21 * 3600, 'UTC')).toMatch(/Tue.*9:00 AM/);
  });

  it('counts the launches that fall in blocked hours', () => {
    // 12:00 awake, 18 h later is 6 AM Tuesday: blocked; 21 h later is 9 AM: awake.
    expect(launchesInBlockedHours(solution([0, 18 * 3600, 21 * 3600]), MON_NOON, daily(7, 23))).toBe(1);
  });

  it('no hours: none', () => {
    expect(launchesInBlockedHours(solution([0, 18 * 3600]), MON_NOON, null)).toBe(0);
  });
});
