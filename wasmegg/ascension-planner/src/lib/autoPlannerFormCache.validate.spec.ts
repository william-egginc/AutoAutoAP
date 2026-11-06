/**
 * Red team 6 Nov 2026, R3: the saved Auto Planner form was read back unchecked. A time zone this browser
 * doesn't know, or a start date or time that isn't one, went straight into the store, and the plan start
 * (chainSearch `plannerStart`, SchedulingInputs, useBackupPlanStart) threw on it, again on every reload.
 * Now each field is checked as it is read; a bad one is dropped (and the console says which), the rest kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { loadAutoPlannerSchedule } from './autoPlannerFormCache';
import { getLocalTimestampInTimezone } from './events';
import { usePlanStartForm, resetPlanStartForm } from '@/composables/usePlanStartForm';
import { resetBackupPlanStart } from '@/composables/useBackupPlanStart';
import { useAutoPlannerStore } from '@/stores/autoPlanner';

const KEY = 'auto_planner_schedule_v1';
const backing = new Map<string, string>();
const seed = (v: unknown) => backing.set(KEY, JSON.stringify(v));

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  backing.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
  });
  setActivePinia(createPinia());
  resetPlanStartForm();
  resetBackupPlanStart();
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 10, 6, 18, 0));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What the plan start (chainSearch `plannerStart`) works out from the store. */
function plannerStart(): number {
  const s = useAutoPlannerStore();
  return getLocalTimestampInTimezone(s.startDate, s.startTime, s.timezone);
}

describe('the saved Auto Planner form, read back (R3)', () => {
  it('an unknown time zone with an overridden start: the page sets up and the plan start works it out', () => {
    seed({ timezone: 'Not/AZone', startTimeOverride: true, startDate: '2026-11-06', startTime: '09:00', targetTE: '' });
    expect(() => usePlanStartForm()).not.toThrow();
    const auto = useAutoPlannerStore();
    expect(auto.timezone).not.toBe('Not/AZone');
    expect([auto.startDate, auto.startTime, auto.startTimeOverride]).toEqual(['2026-11-06', '09:00', true]);
    expect(Number.isFinite(plannerStart())).toBe(true);
    expect(warn.mock.calls.some(c => /timezone/.test(String(c[0]) + String(c[1])))).toBe(true);
  });

  it('an unknown time zone without an override (the start defaults to now in it): no throw', () => {
    seed({ timezone: 'Not/AZone', startDate: '2026-11-06', startTime: '09:00', targetTE: '' });
    expect(() => usePlanStartForm()).not.toThrow();
    expect(Number.isFinite(plannerStart())).toBe(true);
  });

  it('a start date or time that is not one: dropped, so the start is now, not a throw', () => {
    for (const bad of [
      { startDate: 'x', startTime: '09:00' },
      { startDate: '2026-11-06', startTime: '9am' },
      { startDate: '2026-13-40', startTime: '09:00' },
      { startDate: '2026-11-06', startTime: '25:00' },
      { startDate: 20261106, startTime: '09:00' },
    ]) {
      setActivePinia(createPinia());
      resetPlanStartForm();
      resetBackupPlanStart();
      seed({ timezone: 'America/Denver', startTimeOverride: true, targetTE: '', ...bad });
      expect(() => usePlanStartForm(), JSON.stringify(bad)).not.toThrow();
      const auto = useAutoPlannerStore();
      expect(auto.startTimeOverride, JSON.stringify(bad)).toBe(false);
      expect(Number.isFinite(plannerStart()), JSON.stringify(bad)).toBe(true);
    }
  });

  it('drops only the bad fields and keeps the good ones', () => {
    seed({
      timezone: 'America/Denver',
      startDate: '2026-11-06',
      startTime: '09:00',
      startTimeOverride: 'yes',
      startAccount: 42,
      targetTE: 490,
      deferForEarningsMode: true,
      timeOffCuts: { targets: '490', ends: { 0: 'soon' }, starts: {} },
    });
    expect(loadAutoPlannerSchedule()).toEqual({
      timezone: 'America/Denver',
      startDate: '2026-11-06',
      startTime: '09:00',
      deferForEarningsMode: true,
    });
    const said = warn.mock.calls.map(c => c.map(String).join(' ')).join('\n');
    for (const f of ['startTimeOverride', 'startAccount', 'targetTE', 'timeOffCuts']) expect(said).toContain(f);
  });

  it('keeps a good saved form as it is, the empty boxes a patch writes included', () => {
    const good = {
      timezone: 'Asia/Tokyo',
      startDate: '2026-11-06',
      startTime: '09:00',
      startTimeOverride: true,
      startAccount: 'a1b2c3',
      targetTE: '151 251 490',
      deferForEarningsMode: false,
      timeOffCuts: {
        targets: '151 251 490',
        ends: { 0: 1790000000 },
        starts: { 1: 1790050000 },
        start: '2026-11-06 09:00',
      },
    };
    seed(good);
    expect(loadAutoPlannerSchedule()).toEqual(good);
    seed({ timezone: '', startDate: '', startTime: '', targetTE: '', timeOffCuts: null });
    expect(loadAutoPlannerSchedule()).toEqual({
      timezone: '',
      startDate: '',
      startTime: '',
      targetTE: '',
      timeOffCuts: null,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('something that is not a form at all reads as nothing saved', () => {
    for (const v of ['"x"', '[1,2]', '7', 'null', '{bad json'] as const) {
      backing.set(KEY, v);
      expect(loadAutoPlannerSchedule(), v).toBeNull();
    }
  });
});
