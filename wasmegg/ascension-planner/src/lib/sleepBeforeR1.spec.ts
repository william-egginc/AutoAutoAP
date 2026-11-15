/**
 * "You won't reach R1 before you sleep" (Jordan, 15 Nov 2026; aaap-tools notes/sleep-before-r1-scope-2026-11-15.md):
 * the warning's pure check. R1 is the first shift to Resilience (the silo buys). Hours 7 AM-11 PM Denver, Wednesday
 * 18 Nov 2026 (no research sale).
 */
import { describe, expect, it } from 'vitest';
import { sleepBeforeR1 } from './sleepBeforeR1';
import type { Availability } from '@/search/availability';

const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
/** Denver wall time on 18-19 Nov 2026 (MST, UTC-7). */
const at = (day: 18 | 19, hhmm: string) => Date.parse(`2026-11-${day}T${hhmm}:00-07:00`) / 1000;
const shifts = (r1: number) => [
  { at: r1 - 3600, egg: 'kindness' },
  { at: r1 - 1800, egg: 'integrity' },
  { at: r1, egg: 'resilience' },
  { at: r1 + 1800, egg: 'curiosity' },
];

describe('sleepBeforeR1', () => {
  it('flags a leg that starts at 9:00 PM and reaches R1 at 1:00 AM: sleep starts at 11:00 PM', () => {
    const start = at(18, '21:00');
    expect(sleepBeforeR1({ start, shifts: shifts(at(19, '01:00')), hours: HOURS })).toEqual({
      r1At: at(19, '01:00'),
      sleepAt: at(18, '23:00'),
      exact: true,
    });
  });

  it('no flag when R1 comes before 11:00 PM', () => {
    expect(sleepBeforeR1({ start: at(18, '20:00'), shifts: shifts(at(18, '22:30')), hours: HOURS })).toBeNull();
  });

  it('no flag without hours, with hours that cover the whole day, or with held shifts (the plan already waits)', () => {
    const leg = { start: at(18, '21:00'), shifts: shifts(at(19, '01:00')) };
    expect(sleepBeforeR1({ ...leg, hours: null })).toBeNull();
    expect(sleepBeforeR1({ ...leg, hours: { days: [], fromHour: 0, toHour: 0, timezone: 'America/Denver' } })).toBeNull();
    expect(sleepBeforeR1({ ...leg, hours: HOURS, heldShifts: true })).toBeNull();
  });

  it('a leg that never shifts to Resilience (a continue) has no R1: no flag', () => {
    const noR = [{ at: at(19, '01:00'), egg: 'humility' }];
    expect(sleepBeforeR1({ start: at(18, '21:00'), shifts: noR, hours: HOURS })).toBeNull();
  });

  it("a fresh table-priced leg without its opening's shifts: R1 is bounded by the opening's measured span, marked not exact", () => {
    const r = sleepBeforeR1({ start: at(18, '22:30'), fresh: true, startTE: 200, hours: HOURS });
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
    expect(r!.sleepAt).toBe(at(18, '23:00'));
    expect(r!.r1At).toBeGreaterThan(at(18, '23:00'));
  });

  it('a fresh table-priced leg whose opening ends before 11:00 PM: no flag', () => {
    expect(sleepBeforeR1({ start: at(18, '09:00'), fresh: true, startTE: 200, hours: HOURS })).toBeNull();
  });
});
