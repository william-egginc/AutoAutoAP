/**
 * What the Fits request tells the solver about Jordan's hours (7 AM to 1 AM, Denver) for his visit that starts Fri 11:04 PM
 * (23 Nov 2026, shot 2): 6 hours of sleep a day, awake at the start and 16 h 4 min into the day, no launch floor at Max.
 * The solver then models a launch made before bed as one that spends a night (SPEC section 9): the sleep window itself is
 * not launched in, and a ship longer than the sleep charges its excess to the waking time.
 */
import { describe, expect, it } from 'vitest';
import { EFFORT_LAUNCH_PERIOD_SECONDS } from 'lib/mission-optimizer/effort';
import { scheduleArgsOf } from 'lib/mission-optimizer/schedule-settings';
import type { Availability } from '@/search/availabilitySchedule';
import { newVisitSettings } from './humilityOptimizer';
import { awakeWindowFor } from './optimizerHours';

const hours: Availability = { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' };
const start = Date.parse('2027-05-14T23:04:00-06:00') / 1000;

describe("Jordan's 7 AM to 1 AM, as the Fits request carries it", () => {
  const w = awakeWindowFor(hours, start, 3 * 86400)!;
  const args = scheduleArgsOf({ ...newVisitSettings(), sleepEnabled: w.sleepHours > 0, sleepHours: w.sleepHours, hoursSinceWake: w.hoursSinceWake })!;

  it('6 hours of sleep and a wake-up 16 h 4 min before the start', () => {
    expect(w).toMatchObject({ sleepHours: 6, awakeFrom: 7, awakeTo: 1, exact: true });
    expect(args.sleepSeconds).toBe(6 * 3600);
    expect(args.wakeOffsetSeconds).toBe((16 * 60 + 4) * 60);
  });

  it('the start is inside the waking window (18 h), so the plan starts awake and launches at once', () => {
    expect(args.wakeOffsetSeconds!).toBeLessThan((24 - 6) * 3600);
  });

  it('Max has no launch floor, so every ship runs its own duration', () => {
    expect(EFFORT_LAUNCH_PERIOD_SECONDS.max).toBe(0);
  });
});
