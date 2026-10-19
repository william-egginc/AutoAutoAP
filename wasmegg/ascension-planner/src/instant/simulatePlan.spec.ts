import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { loadAutoPlannerSchedule } from '@/lib/autoPlannerFormCache';
import { hasPendingSimulate, requestSimulate, runPendingSimulate } from './simulatePlan';

/** A localStorage for Node, as the form cache uses it. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: k => m.get(k) ?? null,
    key: i => [...m.keys()][i] ?? null,
    removeItem: k => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('"Simulate this plan" into Joo’s Auto Planner', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    setActivePinia(createPinia());
  });

  // Mon 4 Jan 2027, 10:00 am Denver (17:00 UTC), and a start 20 s past a minute.
  const START = Date.parse('2027-01-04T17:00:20Z') / 1000;

  it('fills the form (start, in the planner’s timezone, rounded up to the minute; the stops) and its cache', () => {
    const planner = useAutoPlannerStore();
    planner.timezone = 'America/Denver';
    requestSimulate(planner, { chain: [200, 250, 490], start: START, a1: '2-sale' });
    expect(planner.startDate).toBe('2027-01-04');
    expect(planner.startTime).toBe('10:01');
    expect(planner.targetTE).toBe('200 250 490');
    // AutomaticPlanner restores the cache on mount: it must hold the same, or the route is lost.
    expect(loadAutoPlannerSchedule()).toMatchObject({
      timezone: 'America/Denver',
      startDate: '2027-01-04',
      startTime: '10:01',
      targetTE: '200 250 490',
    });
    expect(hasPendingSimulate()).toBe(true);
  });

  it('on the planner’s mount: clears the old plan, pins A1 to the answer’s build, and runs his generate once', () => {
    const planner = useAutoPlannerStore();
    planner.timezone = 'UTC';
    planner.planVariantOverrides = { 2: 'continue' };
    planner.endTimeOverrides = { 1: 123 };
    planner.ascensionChain = [{ index: 0, variants: {}, goal: { type: 'te', te: 300, date: '', time: '' } }];
    requestSimulate(planner, { chain: [300, 490], start: START, a1: '1-sale-tier13' });
    const generate = vi.fn();
    expect(runPendingSimulate(planner, generate)).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(planner.ascensionChain).toEqual([]);
    expect(planner.planVariantOverrides).toEqual({ 0: '1-sale-tier13' });
    expect(planner.endTimeOverrides).toEqual({});
    // Once: a later mount (the tab opened again) is the planner's own.
    expect(runPendingSimulate(planner, generate)).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a mount with no request, and pins nothing for a label that is not a build', () => {
    const planner = useAutoPlannerStore();
    const generate = vi.fn();
    expect(runPendingSimulate(planner, generate)).toBe(false);
    expect(generate).not.toHaveBeenCalled();
    requestSimulate(planner, { chain: [490], start: START, a1: 'first' });
    runPendingSimulate(planner, generate);
    expect(planner.planVariantOverrides).toEqual({});
  });
});
