/**
 * The R1 sleep warning, asked per surface (lib/sleepBeforeR1View.ts). Hours 7 AM-11 PM Denver, Wednesday 18 Nov 2026 (MST, UTC-7).
 */
import { describe, expect, it } from 'vitest';
import { r1IfPrestigeNow, r1OfShifts, r1OfTableAscension, r1OfTrackerLines } from './sleepBeforeR1View';
import type { Availability } from '@/search/availability';

const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
const at = (day: 18 | 19, hhmm: string) => Date.parse(`2026-11-${day}T${hhmm}:00-07:00`) / 1000;
const shifts = (r1: number) => [
  { at: r1 - 3600, egg: 'curiosity' },
  { at: r1, egg: 'resilience' },
  { at: r1 + 1800, egg: 'curiosity' },
  { at: r1 + 9000, egg: 'humility' },
];

describe('a table-priced ascension (route cards, the timeline, a follow\'s later ones)', () => {
  it('flags a start late in the evening (the opening runs past bedtime), "about": exact is false', () => {
    const r = r1OfTableAscension({ start: at(18, '22:30'), fromTE: 150, hours: HOURS });
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
    expect(r!.sleepAt).toBe(at(18, '23:00'));
  });
  it('not at 7 AM, and not without hours', () => {
    expect(r1OfTableAscension({ start: at(18, '07:00'), fromTE: 150, hours: HOURS })).toBeNull();
    expect(r1OfTableAscension({ start: at(18, '22:30'), fromTE: 150, hours: null })).toBeNull();
  });
});

describe('an ascension with all its shifts (simulated)', () => {
  it('flags R1 at 1 AM from a 9 PM start; none when R1 is done before bed; none when R1 is skipped', () => {
    expect(r1OfShifts({ start: at(18, '21:00'), shifts: shifts(at(19, '01:00')), hours: HOURS })).toMatchObject({ exact: true, sleepAt: at(18, '23:00') });
    expect(r1OfShifts({ start: at(18, '20:00'), shifts: shifts(at(18, '21:30')), hours: HOURS })).toBeNull();
    expect(r1OfShifts({ start: at(18, '21:00'), shifts: [{ at: at(18, '22:00'), egg: 'humility' }], hours: HOURS })).toBeNull();
  });
});

describe('the Build-up tracker: the shifts still ahead, only while R1 is ahead', () => {
  const line = (t: number, egg: string) => ({ kind: 'shift', at: t, items: [{ kind: 'shift', egg }] });
  const lines = shifts(at(19, '01:00')).map(s => line(s.at, s.egg));
  it('flagged: now 9 PM, R1 at 1 AM', () => {
    expect(r1OfTrackerLines(lines, at(18, '21:00'), HOURS)).toMatchObject({ exact: true, sleepAt: at(18, '23:00') });
  });
  it('not once R1 has begun (now is past it), not without hours, not with no shift lines', () => {
    expect(r1OfTrackerLines(lines, at(19, '01:10'), HOURS)).toBeNull();
    expect(r1OfTrackerLines(lines, at(18, '21:00'), null)).toBeNull();
    expect(r1OfTrackerLines([{ kind: 'research', at: at(18, '21:30') }], at(18, '21:00'), HOURS)).toBeNull();
    expect(r1OfTrackerLines(null, at(18, '21:00'), HOURS)).toBeNull();
  });
});

describe('My runs: if you prestige now', () => {
  it('flagged late in the evening; the start is the later of now and the prestige\'s time', () => {
    expect(r1IfPrestigeNow({ now: at(18, '22:30'), startTE: 150, hours: HOURS })).not.toBeNull();
    // A prestige held until morning starts at 7 AM: no warning.
    expect(r1IfPrestigeNow({ now: at(18, '22:30'), at: at(19, '07:00'), startTE: 150, hours: HOURS })).toBeNull();
  });
  it('not in the morning, not without hours', () => {
    expect(r1IfPrestigeNow({ now: at(18, '09:00'), startTE: 150, hours: HOURS })).toBeNull();
    expect(r1IfPrestigeNow({ now: at(18, '22:30'), startTE: 150, hours: null })).toBeNull();
  });
});
