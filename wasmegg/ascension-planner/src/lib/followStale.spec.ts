/**
 * The save contradicts the followed route (lib/followStale.ts; alt A1, 30 Oct 2026): the wrong egg for the route's
 * step, a planned step overdue, other awake hours. Fixed clock, relative times, placeholder plans.
 */
import { describe, expect, it } from 'vitest';
import { STALE_GRACE_SECONDS, answerFirstLeg, followStaleness } from './followStale';
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

/**
 * A FOLLOWED EMPTY BUILD-UP (spec-noemptybuild, 31 Oct 2026; Jordan's alt): a route followed from this very save, whose
 * first ascension is the 6-shift build-up that buys nothing (Curiosity at the plan start, then H, K, C, I, R), ending
 * Dec 13, 10:50 am; continue (3 shifts) ends Dec 12, 10:50 am. The save is on Kindness, before the plan start: no egg,
 * overdue or hours reason holds, so before this nothing offered to re-plan.
 */
describe('the followed first ascension is a build-up the answer for this save no longer takes', () => {
  const SAVE = Date.UTC(2026, 9, 31, 16, 8) / 1000; // Oct 31, 10:08 am Mountain
  const START = Date.UTC(2026, 9, 31, 21, 9) / 1000; // the plan start, 3:09 pm Mountain
  const BUILD_END = 1797184206; // Dec 13, 10:50 am Mountain
  const CONT_END = 1797097806; // Dec 12, 10:50 am Mountain
  const a1 = (ends?: LegSummary['firstLegEnds']) => ({
    ...leg(START, BUILD_END, 166, [
      { at: START, egg: 'curiosity', fromEgg: 'kindness' },
      { at: START + 5.83 * D, egg: 'humility', fromEgg: 'curiosity' },
      { at: START + 6.83 * D, egg: 'kindness', fromEgg: 'humility' },
      { at: START + 8.83 * D, egg: 'curiosity', fromEgg: 'kindness' },
      { at: START + 16.22 * D, egg: 'integrity', fromEgg: 'curiosity' },
      { at: START + 27.43 * D, egg: 'resilience', fromEgg: 'integrity' },
    ]),
    ...(ends ? { firstLegEnds: ends } : {}),
  });
  const followed = (ends?: LegSummary['firstLegEnds']): NowPlan => ({
    ...plan,
    chain: [166, 200, 490],
    planStart: START,
    legs: [a1(ends), leg(BUILD_END, BUILD_END + 20 * D, 200, []), leg(BUILD_END + 20 * D, BUILD_END + 200 * D, 490, [])],
  });
  const answer = { key: 'continue', to: 166, end: CONT_END };
  const stale = (p: NowPlan, o: { answer?: typeof answer | null; seconds?: number; egg?: string } = {}) =>
    followStaleness({ plan: p, save: { seconds: o.seconds ?? SAVE, egg: o.egg ?? 'kindness', te: 146 }, hoursDiffer: false, answer: o.answer });

  it('no other reason holds for it (the egg matches, nothing is overdue)', () => {
    expect(stale(followed())).toBeNull();
  });

  it("said when the follow's own record has continue ending no later", () => {
    expect(stale(followed({ continue: CONT_END, buildup: BUILD_END }))).toEqual({ kind: 'emptyBuildUp' });
    // A tie too: continue wins ties.
    expect(stale(followed({ continue: BUILD_END, buildup: BUILD_END }))).toEqual({ kind: 'emptyBuildUp' });
    // A build-up that was sooner than continue: the route stands.
    expect(stale(followed({ continue: BUILD_END + H, buildup: BUILD_END }))).toBeNull();
  });

  it("said when this save's answer continues to the same stop, no later than the followed build-up", () => {
    expect(stale(followed(), { answer })).toEqual({ kind: 'emptyBuildUp' });
    expect(stale(followed(), { answer: { ...answer, end: BUILD_END } })).toEqual({ kind: 'emptyBuildUp' });
    // Not when the answer builds up, prestiges, stops elsewhere or ends later.
    expect(stale(followed(), { answer: { ...answer, key: 'buildup' } })).toBeNull();
    expect(stale(followed(), { answer: { ...answer, key: '2-sale' } })).toBeNull();
    expect(stale(followed(), { answer: { ...answer, to: 167 } })).toBeNull();
    expect(stale(followed(), { answer: { ...answer, end: BUILD_END + 1 } })).toBeNull();
  });

  it('not once the player is following the build-up (a shift of it behind the save), nor after the first ascension', () => {
    // Shifted to Curiosity as the route said, a day on: the route they are on.
    expect(stale(followed({ continue: CONT_END, buildup: BUILD_END }), { seconds: START + D, egg: 'curiosity' })).toBeNull();
    // Past the first ascension (an overdue prestige says so instead).
    expect(stale(followed({ continue: CONT_END, buildup: BUILD_END }), { seconds: BUILD_END + D, egg: 'kindness' })?.kind).not.toBe('emptyBuildUp');
    // A continue or a fresh first ascension followed: nothing.
    const cont = followed({ continue: CONT_END });
    cont.legs![0] = { ...cont.legs![0], key: 'continue' };
    expect(stale(cont, { answer })).toBeNull();
  });

  it("from the table's legs: the instant answer's build-up label, against this save's answer", () => {
    const table: NowPlan = {
      ...followed(),
      legs: null,
      tableLegs: [
        { from: 146, to: 166, endTE: 166, start: START, end: BUILD_END, label: 'buildup' },
        { from: 166, to: 200, endTE: 200, start: BUILD_END, end: BUILD_END + 20 * D },
      ],
    };
    expect(stale(table, { answer })).toEqual({ kind: 'emptyBuildUp' });
    expect(stale({ ...table, tableLegs: [{ ...table.tableLegs![0], label: '2-sale' }] }, { answer })).toBeNull();
    // Re-priced on the live save (lib/followSim.ts withCurrentSim): continue, nothing to say.
    expect(stale({ ...table, tableLegs: [{ ...table.tableLegs![0], simulated: true, variant: 'continue' }] }, { answer })).toBeNull();
  });

  it("answerFirstLeg reads a plan's first ascension", () => {
    expect(answerFirstLeg(followed())).toEqual({ key: 'buildup', to: 166, end: BUILD_END });
    expect(answerFirstLeg(null)).toBeNull();
  });
});
