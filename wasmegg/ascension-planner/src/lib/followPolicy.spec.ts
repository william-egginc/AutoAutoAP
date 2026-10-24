/**
 * lib/followPolicy.ts: a Fast, Exact or Custom result that drives Right now while nothing is followed becomes the
 * follow (AUTO_FOLLOW_RESULT); never over a followed route, a gone-back result, another save's plan, or after the
 * player un-followed it.
 */
import { describe, expect, it } from 'vitest';
import { AUTO_FOLLOW_RESULT, autoFollowOf, followedLabel } from './followPolicy';
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

  it('nothing when off, followed, not driving, gone back, another save, or un-followed after it was found', () => {
    expect(autoFollowOf({ ...base, enabled: false })).toBeNull();
    expect(autoFollowOf({ ...base, followed: true })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ plan: instant, takeover: 'later' }) })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ plan: instant, wentBack: true }) })).toBeNull();
    expect(autoFollowOf({ ...base, driving: driving({ found: null, search: null, plan: instant }) })).toBeNull();
    expect(autoFollowOf({ ...base, thisSave: false })).toBeNull();
    expect(autoFollowOf({ ...base, goneAt: found.at + 1 })).toBeNull();
    expect(autoFollowOf({ ...base, goneAt: found.at - 1 })).not.toBeNull();
  });
});

describe('followedLabel', () => {
  it('"your pick" for a press; "from your Fast run" for a result that became the follow (while the constant is on)', () => {
    expect(followedLabel({ source: 'fast' })).toBe('your pick');
    expect(followedLabel({ source: 'instant', auto: true })).toBe('your pick');
    expect(followedLabel({ source: 'exact', auto: true })).toBe(AUTO_FOLLOW_RESULT ? 'from your Exact run' : 'your pick');
    expect(followedLabel(null)).toBe('your pick');
  });
});
