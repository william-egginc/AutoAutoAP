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

describe('a clock change inside the visit', () => {
  // The solver counts fixed 24-hour days from the start, so a launch it puts at "7:00 AM" after the clocks change
  // shows on the wall clock an hour off. The window is made around the hours awake on both sides of the change.
  const denver = (fromHour: number, toHour: number): Availability => ({ days: [], fromHour, toHour, timezone: 'America/Denver' });

  it('clocks go back (Sun 7 Nov 2027): a 7 AM wake-up becomes 8 AM, one more hour of sleep, and a note says why', () => {
    // Fri 5 Nov 2027, 6:30 PM MDT.
    const start = Date.parse('2027-11-05T18:30:00-06:00') / 1000;
    const w = awakeWindowFor(denver(7, 23), start, 6 * DAY)!;
    expect(w).toMatchObject({ awakeFrom: 8, awakeTo: 23, sleepHours: 9, exact: false });
    expect(w.note).toMatch(/clocks change/i);
    expect(w.note).toBe('The clocks change during this visit. The plan stays clear of the hour that moves, so every launch still falls in your awake hours.');
  });

  it('clocks go forward (Sun 14 Mar 2027): the day ends an hour sooner, and a note says why', () => {
    // Fri 12 Mar 2027, 6:30 PM MST.
    const start = Date.parse('2027-03-12T18:30:00-07:00') / 1000;
    const w = awakeWindowFor(denver(7, 23), start, 6 * DAY)!;
    expect(w).toMatchObject({ awakeFrom: 7, awakeTo: 22, sleepHours: 9, exact: false });
    expect(w.note).toMatch(/clocks change/i);
  });

  it('a visit that ends before the change is untouched', () => {
    const start = Date.parse('2027-11-05T18:30:00-06:00') / 1000;
    const w = awakeWindowFor(denver(7, 23), start, DAY)!;
    expect(w).toMatchObject({ awakeFrom: 7, awakeTo: 23, sleepHours: 8, exact: true, note: '' });
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

describe("the first launch of each day is never before the wake-up (Jordan's 7 AM to 1 AM, shot 23 Nov 2026: launches at 6:59 AM)", () => {
  // The solver launches at its own wake-up: the plan start less `hoursSinceWake`, plus whole days. The wake offset was
  // rounded to the NEAREST minute, so a start with seconds put that instant up to 30 s before the real 7:00.
  const denver: Availability = { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' };
  // Fri 14 May 2027, 11:04 PM MDT, plus some seconds.
  const base = Date.parse('2027-05-14T23:04:00-06:00') / 1000;

  it('the solver wake-up instants land at or after 7:00 AM in the awake hours, whatever seconds the start has', () => {
    for (const sec of [0, 1, 7, 29, 30, 31, 45, 59]) {
      const start = base + sec;
      const w = awakeWindowFor(denver, start, 3 * DAY)!;
      expect(w.awakeFrom).toBe(7);
      for (let day = 1; day <= 3; day++) {
        const wake = start - w.hoursSinceWake * 3600 + day * DAY;
        const wall = new Date((wake - 6 * 3600) * 1000);
        const secondsIntoDay = wall.getUTCHours() * 3600 + wall.getUTCMinutes() * 60 + wall.getUTCSeconds();
        expect(secondsIntoDay, `start +${sec}s, day ${day}`).toBeGreaterThanOrEqual(7 * 3600);
        // ... and not a minute or more late.
        expect(secondsIntoDay, `start +${sec}s, day ${day}`).toBeLessThan(7 * 3600 + 60);
      }
    }
  });

  it('launches made at those instants are in the awake hours (not counted as hours off)', () => {
    const start = base + 29;
    const w = awakeWindowFor(denver, start, 3 * DAY)!;
    const solution = { slots: [{ launches: [1, 2, 3].map(d => ({ choice: 0, launchAt: d * DAY - w.hoursSinceWake * 3600 })) }] } as never;
    expect(launchesInBlockedHours(solution, start, denver)).toBe(0);
  });
});

