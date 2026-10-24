/**
 * lib/followPolicy.ts (AUTO_FOLLOW_FIRST, 24 Oct 2026): the first answer for a goal that follows nothing becomes the
 * follow, the instant answer's box route or a Fast, Exact or Custom result that drives Right now; never over a followed
 * route, a gone-back result, another save's plan, a By a date route out of time, or after the goal was un-followed on
 * this device (one time per goal).
 */
import { describe, expect, it } from 'vitest';
import { AUTO_FOLLOW_FIRST, autoFollowOf, autoFollowsGoal, followedLabel, instantAutoFollowOf } from './followPolicy';
import type { Driving } from './searchPlan';
import type { NowPlan } from './nowPlan';

const found = { level: 'Fast' as const, chain: [201, 239], end: 2_000_000_000.4, endTE: 239, legs: [], at: 1_700_000_000_000, planStart: 1_999_000_000 };
const search = { chain: [201, 239] } as unknown as NowPlan;
const instant = { chain: [200, 238] } as unknown as NowPlan;
const driving = (o: Partial<Driving> = {}): Driving => ({ plan: search, instant, search, takeover: 'makes-date', wentBack: false, found, ...o });
const base = { driving: driving(), thisSave: true, followed: false, goneAt: 0, deadline: 2_000_100_000, enabled: true };

describe('autoFollowOf', () => {
  it('the driving result, with the summary a Follow press saves', () => {
    expect(autoFollowOf(base)).toEqual({
      chain: [201, 239],
      source: 'fast',
      at: found.at,
      finish: 2_000_000_000,
      endTE: 239,
      planStart: 1_999_000_000,
      spareSeconds: 100_000,
    });
    expect(autoFollowOf({ ...base, driving: driving({ found: { ...found, level: 'Custom' } }) })?.source).toBe('custom');
  });

  it('nothing when off, followed, not driving, gone back, another save, or un-followed on this device at all', () => {
    expect(autoFollowOf({ ...base, enabled: false })).toBeNull();
    expect(autoFollowOf({ ...base, followed: true })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ plan: instant, takeover: 'later' }) })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ plan: instant, wentBack: true }) })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ found: null, search: null, plan: instant }) })).toBeNull();
    expect(autoFollowOf({ ...base, thisSave: false })).toBeNull();
    // One time per goal: un-followed before (whenever), the result only asks.
    expect(autoFollowOf({ ...base, goneAt: found.at + 1 })).toBeNull();
    expect(autoFollowOf({ ...base, goneAt: found.at - 1 })).toBeNull();
    expect(autoFollowOf({ ...base, goneAt: 0 })).not.toBeNull();
  });
});

describe('instantAutoFollowOf', () => {
  const route = { chain: [205, 238], end: 1_900_000_000.6, endTE: 238 };
  const ib = { route, at: 1_700_000_000_000, planStart: 1_899_000_000, deadline: 1_900_100_000, inTime: true, followed: false, goneAt: 0, enabled: true };

  it('the box route, as the instant answer, with the summary a Follow press saves', () => {
    expect(instantAutoFollowOf(ib)).toEqual({
      chain: [205, 238],
      source: 'instant',
      at: ib.at,
      finish: 1_900_000_001,
      endTE: 238,
      planStart: 1_899_000_000,
      spareSeconds: 99_999,
    });
    // Fastest: no spare.
    expect(instantAutoFollowOf({ ...ib, deadline: null })).not.toHaveProperty('spareSeconds');
  });

  it('nothing when off, followed, un-followed before, out of time, or with no route', () => {
    expect(instantAutoFollowOf({ ...ib, enabled: false })).toBeNull();
    expect(instantAutoFollowOf({ ...ib, followed: true })).toBeNull();
    expect(instantAutoFollowOf({ ...ib, goneAt: 1 })).toBeNull();
    expect(instantAutoFollowOf({ ...ib, inTime: false })).toBeNull();
    expect(instantAutoFollowOf({ ...ib, route: null })).toBeNull();
    expect(instantAutoFollowOf({ ...ib, route: { ...route, chain: [] } })).toBeNull();
  });
});

describe('followedLabel', () => {
  it('"your pick" for a press (Follow it, Restore); "from the instant answer" / "from your Fast run" for the first answer followed on its own', () => {
    expect(followedLabel({ source: 'fast' })).toBe('your pick');
    expect(followedLabel({ source: 'instant' })).toBe('your pick');
    expect(followedLabel({ source: 'manual', auto: true })).toBe('your pick');
    expect(followedLabel({ source: 'instant', auto: true })).toBe(AUTO_FOLLOW_FIRST ? 'from the instant answer' : 'your pick');
    expect(followedLabel({ source: 'fast', auto: true })).toBe(AUTO_FOLLOW_FIRST ? 'from your Fast run' : 'your pick');
    expect(followedLabel({ source: 'exact', auto: true })).toBe(AUTO_FOLLOW_FIRST ? 'from your Exact run' : 'your pick');
    expect(followedLabel({ source: 'custom', auto: true })).toBe(AUTO_FOLLOW_FIRST ? 'from your Custom run' : 'your pick');
    expect(followedLabel(null)).toBe('your pick');
  });
});

describe('which goals follow on their own', () => {
  it('only Fastest to 490 and Egg Day 2027; any other date or race target waits for a Follow press', () => {
    expect(autoFollowsGoal('fastest-490')).toBe(true);
    expect(autoFollowsGoal('eggday-2027')).toBe(true);
    for (const k of ['eggday-2028', 'date-1800000000', 'fastest-300', 'fastest-1000', '', null, undefined]) expect(autoFollowsGoal(k)).toBe(false);
  });
});
