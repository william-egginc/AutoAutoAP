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
      7, 2, 6, 2.4, 24,
    ]);
  });

  it('a table-only answer is Medium for a week, then Low, on both goals; never High', () => {
    expect(howSure(date({ how: 'instant', ageDays: 5, spareHours: 30, runnerUpHours: 99 }))).toEqual({
      level: 'medium',
      reason: 'Instant Answer, 5 days old',
    });
    const f = howSure(fast({ how: 'instant', ageDays: 6.9, runnerUpHours: 99 }));
    expect(f.level).toBe('medium');
    expect(f.reason).toContain('a short search usually finds a sooner route');
    expect(f).not.toHaveProperty('action');
    expect(howSure(date({ how: 'instant', ageDays: 8 })).level).toBe('low');
    expect(howSure(fast({ how: 'instant', ageDays: 8 })).level).toBe('low');
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

  it('or a search that agrees, or a finished Custom', () => {
    expect(howSure(date({ how: 'instant', agreeing: 'quick', spareHours: 10 }))).toEqual({
      level: 'high',
      reason: 'a Fast search agrees on 248 TE',
    });
    expect(howSure(fast({ how: 'search', level: 'exhaustive', exhaustiveComplete: true })).reason).toBe(
      'Custom checked every route in its boxes'
    );
    expect(howSure(fast({ agreeing: 'normal', runnerUpHours: 30 })).level).toBe('high');
    expect(howSure(fast({ agreeing: 'normal', runnerUpHours: 20 })).level).toBe('medium');
    expect(howSure(fast({ agreeing: 'quick', runnerUpHours: 30 })).level).toBe('medium');
    expect(howSure(fast({ agreeing: 'normal' })).reason).toContain("wasn't kept");
  });

  it('Low first: older simulator, other hours, little spare, old, TE moved', () => {
    const high = { exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: 3 };
    expect(howSure(date({ ...high, olderSimulator: true })).reason).toBe('priced by an older simulator');
    expect(howSure(date({ ...high, hoursChanged: true })).reason).toBe('priced for your earlier awake hours');
    expect(howSure(date({ ...high, spareHours: 1.2 })).reason).toBe('only 1.2 h to spare');
    expect(howSure(date({ ...high, ageDays: 20 })).reason).toBe('simulator check, 20 days old, not yet checked against a newer save');
    expect(howSure(date({ ...high, teMoved: true })).reason).toBe('your TE has moved since');
  });
});

describe('how sure has no button, and old does not read as wrong (Jordan, 22 Nov 2026)', () => {
  it('no answer carries an action (Run Fast left the tile)', () => {
    for (const how of ['instant', 'check', 'search'] as const)
      for (const goal of [date, fast])
        expect(howSure(goal({ how, ageDays: 3, level: 'quick' }))).not.toHaveProperty('action');
  });
  it('a stale reason says it is not yet checked against a newer save, and never calls the answer old-therefore-wrong', () => {
    const r = howSure(date({ how: 'instant', ageDays: 30 })).reason;
    expect(r).toBe('instant answer, 30 days old, not yet checked against a newer save');
    expect(r).not.toMatch(/unreliable|out of date|outdated|wrong|stale/i);
    expect(r).not.toMatch(/may well|probably|likely/i);
  });
});

describe('a newer save on the planned route confirms the answer (Jordan, 22 Nov 2026)', () => {
  const confirmed = 'your newer save is on the planned route';
  it('on path: an old answer is not Low for its age and the TE having moved is no reason, on both goals', () => {
    for (const goal of [date, fast]) {
      const r = howSure(goal({ how: 'instant', ageDays: 30, teMoved: true, path: 'on', spareHours: 30, runnerUpHours: 99 }));
      expect(r.level).toBe('medium');
      expect(r.reason).toBe(confirmed);
      expect(r).not.toHaveProperty('action');
    }
    const c = howSure(date({ how: 'check', ageDays: 20, teMoved: true, path: 'on', exactConfirmsTE: true, spareHours: 16.8, runnerUpHours: 3 }));
    expect(c.level).toBe('high');
  });
  it('off the route: Low, and it says a new search is needed', () => {
    const r = howSure(date({ how: 'instant', ageDays: 2, path: 'off' }));
    expect(r).toEqual({ level: 'low', reason: 'your newer save is off the planned route, so it needs a new search' });
  });
  it('unknown, or not given: the old rules, with the 7-day limit and the TE having moved', () => {
    expect(howSure(date({ how: 'instant', ageDays: 8, path: 'unknown' })).reason).toBe(
      'instant answer, 8 days old, not yet checked against a newer save'
    );
    expect(howSure(date({ how: 'instant', ageDays: 8 })).level).toBe('low');
    expect(howSure(date({ how: 'check', teMoved: true, path: 'unknown' })).reason).toBe('your TE has moved since');
  });
  it('what is wrong with the answer itself still wins over a confirmed route', () => {
    const on = { path: 'on' as const, ageDays: 30 };
    expect(howSure(date({ ...on, olderSimulator: true })).reason).toBe('priced by an older simulator');
    expect(howSure(date({ ...on, olderCode: true })).level).toBe('low');
    expect(howSure(date({ ...on, hoursChanged: true })).reason).toBe('priced for your earlier awake hours');
    expect(howSure(date({ ...on, spareHours: 1.2 })).reason).toBe('only 1.2 h to spare');
    expect(howSure(date({ ...on, path: 'off', olderSimulator: true })).reason).toBe('priced by an older simulator');
  });
});

