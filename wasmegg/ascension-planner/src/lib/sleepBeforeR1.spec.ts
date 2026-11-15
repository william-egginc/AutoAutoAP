/**
 * "You won't reach R1 before you sleep" (Jordan, 15 Nov 2026; aaap-tools notes/sleep-before-r1-scope-2026-11-15.md):
 * the warning's pure check. R1 is the Resilience visit before H1 (the first Humility shift), where the silos are bought
 * for up to an hour; the window runs to the end of those buys (game expert, 15 Nov 2026). Hours 7 AM-11 PM Denver,
 * Wednesday 18 Nov 2026 (no research sale).
 */
import { describe, expect, it } from 'vitest';
import { sleepBeforeR1 } from './sleepBeforeR1';
import type { Availability } from '@/search/availability';

const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
/** Denver wall time on 18-19 Nov 2026 (MST, UTC-7). */
const at = (day: 18 | 19, hhmm: string) => Date.parse(`2026-11-${day}T${hhmm}:00-07:00`) / 1000;
/** C2, K2, R1, C3 (R1's buys end by the shift into C3, `c3After` seconds later), then H1. */
const shifts = (r1: number, c3After = 1800) => [
  { at: r1 - 3600, egg: 'curiosity' },
  { at: r1 - 1800, egg: 'kindness' },
  { at: r1, egg: 'resilience' },
  { at: r1 + c3After, egg: 'curiosity' },
  { at: r1 + c3After + 7200, egg: 'humility' },
];

describe('sleepBeforeR1', () => {
  it('flags a leg that starts at 9:00 PM and reaches R1 at 1:00 AM: sleep starts at 11:00 PM', () => {
    const start = at(18, '21:00');
    expect(sleepBeforeR1({ start, shifts: shifts(at(19, '01:00')), hours: HOURS })).toEqual({
      r1At: at(19, '01:00'),
      doneBy: at(19, '01:30'),
      sleepAt: at(18, '23:00'),
      exact: true,
    });
  });

  it('no flag when R1 and its buys are done before 11:00 PM', () => {
    expect(sleepBeforeR1({ start: at(18, '20:00'), shifts: shifts(at(18, '22:00')), hours: HOURS })).toBeNull();
  });

  it("R1 at 10:40 PM whose buys run past 11:00 PM is flagged: the window runs to R1's last buy (by the next shift, at most an hour)", () => {
    const r = sleepBeforeR1({ start: at(18, '20:00'), shifts: shifts(at(18, '22:40'), 2400), hours: HOURS });
    expect(r).toEqual({ r1At: at(18, '22:40'), doneBy: at(18, '23:20'), sleepAt: at(18, '23:00'), exact: true });
    // A next shift more than an hour on: the buys end within the hour.
    const late = sleepBeforeR1({ start: at(18, '20:00'), shifts: shifts(at(18, '21:50'), 3 * 3600), hours: HOURS });
    expect(late).toBeNull();
  });

  it('R1 skipped (it would buy nothing): the only Resilience shift comes after H1 (that is R2): no flag', () => {
    const noR1 = [
      { at: at(18, '21:30'), egg: 'curiosity' },
      { at: at(18, '22:00'), egg: 'humility' },
      { at: at(19, '02:00'), egg: 'resilience' },
    ];
    expect(sleepBeforeR1({ start: at(18, '21:00'), shifts: noR1, hours: HOURS })).toBeNull();
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
    expect(r!.doneBy).toBeGreaterThan(at(18, '23:00'));
    expect(r!.r1At).toBe(r!.doneBy);
  });

  it('a table-priced leg carries its shifts from H1 on only: still bounded by the opening span', () => {
    const fromH1 = [{ at: at(19, '03:00'), egg: 'humility' }];
    const r = sleepBeforeR1({ start: at(18, '22:30'), shifts: fromH1, fresh: true, startTE: 200, hours: HOURS });
    expect(r?.exact).toBe(false);
    expect(r?.sleepAt).toBe(at(18, '23:00'));
  });

  it('a fresh table-priced leg whose opening ends before 11:00 PM: no flag', () => {
    expect(sleepBeforeR1({ start: at(18, '09:00'), fresh: true, startTE: 200, hours: HOURS })).toBeNull();
  });
  it("buys done exactly when the hours end: no flag (sleepAt is always before doneBy)", () => {
    // R1 at 10:30 PM, next shift (C3) at 11:00 PM: done by 11:00 PM, as the hours end.
    expect(sleepBeforeR1({ start: at(18, '20:00'), shifts: shifts(at(18, '22:30'), 1800), hours: HOURS })).toBeNull();
  });

  it('a prestige after the hours have ended (staying up): sleepAt is when the hours ended, not the prestige', () => {
    const r = sleepBeforeR1({ start: at(18, '23:30'), shifts: shifts(at(19, '00:30')), hours: HOURS });
    expect(r).toEqual({ r1At: at(19, '00:30'), doneBy: at(19, '01:00'), sleepAt: at(18, '23:00'), exact: true });
  });
  it('a start off the quarter hour still reports the hours ending on the hour', () => {
    const r = sleepBeforeR1({ start: at(18, '22:37'), shifts: shifts(at(19, '00:10')), hours: HOURS });
    expect(r?.sleepAt).toBe(at(18, '23:00'));
  });
});
