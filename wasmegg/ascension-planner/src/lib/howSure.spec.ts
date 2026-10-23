import { describe, expect, it } from 'vitest';
import {
  HIGH_RUNNER_UP_DATE_HOURS,
  HIGH_RUNNER_UP_FASTEST_HOURS,
  HIGH_SPARE_HOURS,
  LOW_SPARE_HOURS,
  STALE_DAYS,
  howSure,
  type SureInput,
} from './howSure';

const date = (o: Partial<SureInput>): SureInput => ({ goal: 'date', how: 'check', ageDays: 0.1, te: 248, ...o });
const fast = (o: Partial<SureInput>): SureInput => ({ goal: 'fastest', how: 'check', ageDays: 0.1, ...o });

describe('how sure', () => {
  it('keeps its thresholds as named constants', () => {
    expect([STALE_DAYS, LOW_SPARE_HOURS, HIGH_SPARE_HOURS, HIGH_RUNNER_UP_DATE_HOURS, HIGH_RUNNER_UP_FASTEST_HOURS]).toEqual([
      14, 2, 6, 2.4, 24,
    ]);
  });

  it('a table-only answer is Medium for two weeks, then Low, on both goals; never High', () => {
    expect(howSure(date({ how: 'instant', ageDays: 5, spareHours: 30, runnerUpHours: 99 }))).toEqual({
      level: 'medium',
      reason: 'instant answer, 5 days old',
      action: 'fast',
    });
    const f = howSure(fast({ how: 'instant', ageDays: 13.9, runnerUpHours: 99 }));
    expect(f.level).toBe('medium');
    expect(f.reason).toContain('a short search usually finds a sooner route');
    expect(f.action).toBe('fast');
    expect(howSure(date({ how: 'instant', ageDays: 15 })).level).toBe('low');
    expect(howSure(fast({ how: 'instant', ageDays: 15 })).level).toBe('low');
  });

  it('High on By a date needs Check exactly confirming the TE, 6 h spare and the runner-up over 2.4 h behind', () => {
    expect(howSure(date({ exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: 3 })).level).toBe('high');
    expect(howSure(date({ exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: Infinity })).reason).toContain('makes less TE');
    expect(howSure(date({ exactConfirmsTE: true, spareHours: 5.9, runnerUpHours: 3 })).level).toBe('medium');
    expect(howSure(date({ exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: 2.4 })).reason).toBe(
      'simulator check done; the next route is only 2.4 h behind'
    );
    expect(howSure(date({ exactConfirmsTE: false, spareHours: 16.8, runnerUpHours: 9 })).level).toBe('medium');
    expect(howSure(date({ exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: null })).level).toBe('medium');
  });

  it('or a search that agrees, or a finished Exhaustive', () => {
    expect(howSure(date({ how: 'instant', agreeing: 'quick', spareHours: 10 }))).toEqual({
      level: 'high',
      reason: 'a Fast search agrees on 248 TE',
    });
    expect(howSure(fast({ how: 'search', level: 'exhaustive', exhaustiveComplete: true })).reason).toBe(
      'Exhaustive checked every route in its boxes'
    );
    expect(howSure(fast({ agreeing: 'normal', runnerUpHours: 30 })).level).toBe('high');
    expect(howSure(fast({ agreeing: 'normal', runnerUpHours: 20 })).level).toBe('medium');
    expect(howSure(fast({ agreeing: 'quick', runnerUpHours: 30 })).level).toBe('medium');
    expect(howSure(fast({ agreeing: 'normal' })).reason).toContain("wasn't kept");
  });

  it('Low first: older simulator, other hours, little spare, old, TE moved', () => {
    const high = { exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: 3 };
    expect(howSure(date({ ...high, olderSimulator: true })).reason).toBe('priced by an older simulator');
    expect(howSure(date({ ...high, hoursChanged: true })).reason).toBe('priced before your hours changed');
    expect(howSure(date({ ...high, spareHours: 1.2 })).reason).toBe('only 1.2 h to spare');
    expect(howSure(date({ ...high, ageDays: 20 })).reason).toBe('simulator check, 20 days old');
    expect(howSure(date({ ...high, teMoved: true })).reason).toBe('your TE has moved since');
  });
});
