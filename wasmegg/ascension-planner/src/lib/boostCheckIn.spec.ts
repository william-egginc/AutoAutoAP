/**
 * The Build-up tracker's 2x line (Jordan, 15 Nov 2026): while the Monday 2x (Mon 9:00 AM to Tue 9:00 AM Pacific) is ahead
 * within the plan, or on now, say when to check in and collect. Away earnings take the multiplier active when you check in.
 */
import { describe, expect, it } from 'vitest';
import { boostCheckIn } from './boostCheckIn';

/** Pacific wall time in Nov 2026 (PST, UTC-8). */
const pt = (day: number, hhmm: string) => Date.parse(`2026-11-${String(day).padStart(2, '0')}T${hhmm}:00-08:00`) / 1000;
const MON_9 = pt(23, '09:00');
const TUE_9 = pt(24, '09:00');

describe('boostCheckIn', () => {
  it('Saturday with the plan running past Monday: the next 2x, not active', () => {
    expect(boostCheckIn(pt(21, '12:00'), pt(25, '12:00'))).toEqual({ start: MON_9, end: TUE_9, active: false });
  });
  it('the plan ends before Monday 9:00 AM: nothing', () => {
    expect(boostCheckIn(pt(21, '12:00'), pt(23, '08:00'))).toBeNull();
  });
  it('during the 2x: active, ends Tuesday 9:00 AM', () => {
    expect(boostCheckIn(pt(23, '15:00'), pt(25, '12:00'))).toEqual({ start: MON_9, end: TUE_9, active: true });
  });
  it('after it ended (Tuesday afternoon), a plan ending Friday: nothing', () => {
    expect(boostCheckIn(pt(24, '15:00'), pt(27, '12:00'))).toBeNull();
  });
  it('no plan end: nothing', () => {
    expect(boostCheckIn(pt(21, '12:00'), null)).toBeNull();
  });
});
