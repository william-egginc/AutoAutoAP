/**
 * The save contradicts the followed route (lib/followStale.ts; alt A1, 30 Oct 2026): the wrong egg for the route's
 * step, a planned step overdue, other awake hours. Fixed clock, relative times, placeholder plans.
 */
import { describe, expect, it } from 'vitest';
import { STALE_GRACE_SECONDS, followStaleness } from './followStale';
import type { NowPlan } from './nowPlan';
import type { LegSummary } from '@/search/types';

const T0 = Date.UTC(2026, 9, 29, 1, 31) / 1000; // the older save the route was planned from
const H = 3600;
const D = 86400;
const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts']) =>
  ({ key: 'buildup', endTE, durationSeconds: end - start, maxELR: 3e12, endTime: end, tier13Unlocked: false, startTime: start, shifts }) as LegSummary;

// Planned from T0 on Kindness: C3 at once, H1 and K3 a day and a half on, prestige at 209 on day 3.
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [209, 287, 490],
  end: T0 + 40 * D,
  endTE: 490,
  legs: [
    leg(T0, T0 + 3 * D, 209, [
      { at: T0, egg: 'curiosity', fromEgg: 'kindness', te: 0 },
      { at: T0 + 1.5 * D, egg: 'humility', fromEgg: 'curiosity', te: 0 },
      { at: T0 + 1.5 * D, egg: 'kindness', fromEgg: 'humility', te: 0 },
    ]),
    leg(T0 + 3 * D, T0 + 10 * D, 287, []),
    leg(T0 + 10 * D, T0 + 40 * D, 490, []),
  ],
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: T0 * 1000,
  planStart: T0,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const at = (seconds: number, egg: string | null, te = 146, hoursDiffer = false, p: NowPlan | null = plan) =>
  followStaleness({ plan: p, save: { seconds, egg, te }, hoursDiffer });

describe('the save contradicts the followed route', () => {
  it('wrong egg: the save on Kindness 14 hours on, the route on Curiosity', () => {
    expect(at(T0 + 14 * H, 'kindness')).toEqual({ kind: 'egg', saveEgg: 'kindness', planEgg: 'curiosity' });
  });

  it('a shift just due (within the grace) is no contradiction; nor a shift made a little early', () => {
    expect(at(T0 + STALE_GRACE_SECONDS - 60, 'kindness')).toBeNull();
    expect(at(T0 + 1.5 * D - H, 'kindness')).toBeNull(); // K3 is an hour away
  });

  it('overdue step: off virtue (egg unknown) the overdue prestige at 209 still says so', () => {
    expect(at(T0 + 3 * D + 3 * H, null, 180)).toEqual({ kind: 'overdue', step: 'prestige', te: 209, at: T0 + 3 * D });
    // Within the grace: not yet.
    expect(at(T0 + 3 * D + H, null, 180)).toBeNull();
  });

  it('overdue shift from the table\'s legs (no simulated legs, so no egg reason)', () => {
    const table: NowPlan = {
      ...plan,
      legs: null,
      tableLegs: [
        { from: 146, to: 209, endTE: 209, start: T0, end: T0 + 3 * D, shifts: [{ at: T0 + 5 * H, egg: 'integrity' }] },
        { from: 209, to: 287, endTE: 287, start: T0 + 3 * D, end: T0 + 10 * D },
        { from: 287, to: 490, endTE: 490, start: T0 + 10 * D, end: T0 + 40 * D },
      ],
    };
    expect(at(T0 + 14 * H, 'kindness', 146, false, table)).toEqual({ kind: 'overdue', step: 'shift', egg: 'integrity', at: T0 + 5 * H });
    expect(at(T0 + 14 * H, 'integrity', 146, false, table)).toBeNull();
  });

  it('different awake hours: said when nothing else is', () => {
    expect(at(T0 + 14 * H, 'curiosity', 146, true)).toEqual({ kind: 'hours' });
    expect(at(T0 + 14 * H, 'kindness', 146, true)?.kind).toBe('egg');
    expect(followStaleness({ plan: null, save: null, hoursDiffer: true })).toEqual({ kind: 'hours' });
  });

  it('the save agrees with the route: nothing', () => {
    expect(at(T0 + 14 * H, 'curiosity')).toBeNull();
    expect(at(T0 + 1.5 * D + 3 * H, 'kindness')).toBeNull();
    expect(at(T0 + 4 * D, 'kindness', 215)).toBeNull(); // prestiged at 209, on the next ascension
    expect(followStaleness({ plan: null, save: null, hoursDiffer: false })).toBeNull();
  });
});
