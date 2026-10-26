/**
 * REGRESSION (26 Oct 2026, Williamthe5thc on egg-beta 14866724: My runs "went backwards"). With his synced setup (awake
 * hours 7 AM-11 PM Denver, time off Oct 29-30, no prestige Oct 27) the current-ascension simulation of his Egg Day route
 * 197 → 219 → … came back from the chain evaluator as TWO segments: the ascension cut when the time off starts
 * ('stopped', at 196 TE) and the rebuild after it ('restarted', to 197). Only the first was read; it ends below the
 * stop, so `withCurrentSim` dropped it and Right now fell back to the table without a word ("The instant answer doesn't
 * keep the shifts of the ascension you are in"). Now every segment is read: the ascension you are in ends when the time
 * off starts (the home farm is a prestige), and is built again after it.
 *
 * The chain evaluator is the real one (search/chain.ts); only `runLeg` is a toy: one TE every two days, the continue on
 * the save's farm shifting to Kindness on Oct 27 at 10:44 AM.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LegSummary, SearchInputs } from '@/search/types';

const DAY = 86400;
const KINDNESS = Date.parse('2026-10-27T16:44:00Z') / 1000; // Oct 27, 10:44 AM Denver
vi.mock('@/search/leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  farmLaying: () => null,
  saveSiloSeconds: () => 2 * DAY,
  runLeg: (_i: unknown, _s: unknown, start: number, target: number, allowContinue: boolean, te: number, _idx: number, endOverride?: number) => {
    const summary = (end: number, endTE: number) => ({ endTE, endTime: end, startTime: start, totalDurationSeconds: end - start, maxELR: 1e12, tier13Unlocked: false, buildPhaseEndTime: start });
    const shifts = allowContinue && KINDNESS > start ? [{ at: KINDNESS, egg: 'kindness', fromEgg: 'curiosity' }] : [{ at: start + DAY, egg: 'humility', fromEgg: 'curiosity' }];
    const key = allowContinue ? 'continue' : '1-sale';
    if (endOverride !== undefined) {
      const endTE = te + Math.floor((endOverride - start) / (2 * DAY));
      return { summary: summary(endOverride, endTE), key, nextState: {}, shifts: shifts.filter(s => s.at < endOverride), heldSeconds: 0, lastEgg: 'kindness' };
    }
    return { summary: summary(start + (target - te) * 2 * DAY, target), key, nextState: {}, shifts, heldSeconds: 0, lastEgg: 'kindness' };
  },
}));

const { createChainEvaluator } = await import('@/search/chain');
const { timeOffWindows } = await import('@/search/timeOff');
const { simLegFromSegments, simLegOf, withCurrentSim } = await import('./followSim');
const { nextAction, nextShifts } = await import('./nextAction');

const ZONE = 'America/Denver';
const PLAN_START = Date.parse('2026-10-26T18:00:00Z') / 1000; // Oct 26, noon Denver
const timeOff = timeOffWindows([{ from: '2026-10-29', to: '2026-10-30' }], ZONE);
const noPrestige = timeOffWindows([{ from: '2026-10-27', to: '2026-10-27' }], ZONE);
const inputs = {
  baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 195 },
  planStart: PLAN_START,
  currentTE: 195,
  final: 310,
  availability: { days: [], fromHour: 7, toHour: 23, timezone: ZONE },
  timeOff,
  noPrestige,
  milestones: [],
  deferShifts: true,
} as unknown as SearchInputs;

const plan = {
  goal: 'date',
  deadline: null,
  chain: [197, 219, 247, 278, 310],
  end: PLAN_START + 60 * DAY,
  endTE: 310,
  legs: null,
  tableLegs: [
    { from: 195, to: 197, endTE: 197, start: PLAN_START, end: Date.parse('2026-10-30T13:00:00Z') / 1000 },
    { from: 197, to: 219, endTE: 219, start: PLAN_START + 6 * DAY, end: PLAN_START + 20 * DAY },
  ],
  exact: false,
  estimated: true,
  instantTE: null,
  calculatedAt: 0,
  planStart: PLAN_START,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
} as never;

describe('the current ascension with time off inside it', () => {
  const r = createChainEvaluator(inputs).evaluate([197])!;
  it('the evaluator gives the cut ascension and its rebuild', () => {
    expect(r.legs.map(l => [l.timeOff, l.endTE])).toEqual([
      ['stopped', 196],
      ['restarted', 197],
    ]);
    expect(r.legs[0].endTime).toBe(timeOff[0].from);
  });

  it('14866724 read only the first segment: it ends below the stop, so the simulation was dropped', () => {
    const old = simLegOf(r.legs[0] as LegSummary)!;
    expect(withCurrentSim(plan, old)).toBe(plan);
  });

  it('now every segment: A1 is the simulated one, cut at the time off and built again after it', () => {
    const leg = simLegFromSegments(r.legs, { timeOff: inputs.timeOff, currentTE: 195, planStart: PLAN_START })!;
    expect(leg.endTE).toBe(197);
    expect(leg.timeOff).toMatchObject({ from: timeOff[0].from, te: 196 });
    expect(leg.timeOff!.to).toBeGreaterThanOrEqual(timeOff[0].to);
    expect(leg.shifts[0]).toEqual({ at: KINDNESS, egg: 'kindness' });
    const p = withCurrentSim(plan, leg) as { tableLegs: { simulated?: boolean; timeOff?: unknown }[] };
    expect(p.tableLegs[0]).toMatchObject({ simulated: true, timeOff: leg.timeOff });

    // Next step: the shift to Kindness first; then the time off (to the home farm at 196 TE), never a prestige inside it.
    const a = { to: 197, endTE: 197, start: leg.startTime, end: leg.endTime, shifts: leg.shifts, simulated: true, live: true, timeOff: leg.timeOff };
    expect(nextAction({ now: PLAN_START + 3600, leg: a, last: false })).toEqual({ kind: 'shift', egg: 'kindness', at: KINDNESS });
    expect(nextAction({ now: KINDNESS + 60, leg: a, last: false })).toEqual({ kind: 'timeoff', at: timeOff[0].from, te: 196 });
    expect(nextAction({ now: timeOff[0].from + 3600, leg: a, last: false })).toEqual({ kind: 'back', at: leg.timeOff!.to });
    const lines = nextShifts({ now: PLAN_START + 3600, legs: [a], more: true });
    expect(lines.map(l => l.kind)).toEqual(['shift', 'timeoff', 'back', 'shift', 'prestige']);
    for (const l of lines) if (l.kind === 'prestige') expect(l.at < timeOff[0].from || l.at >= timeOff[0].to).toBe(true);
  });

  it('no TE gained before the time off: the rebuild alone still makes A1, ending at the save\'s TE when the time off starts', () => {
    const rebuildOnly = [{ ...(r.legs[1] as LegSummary) }];
    const leg = simLegFromSegments(rebuildOnly, { timeOff: inputs.timeOff, currentTE: 195.4, planStart: PLAN_START })!;
    expect(leg.timeOff).toMatchObject({ from: timeOff[0].from, te: 195 });
    expect(leg.startTime).toBe(PLAN_START);
    expect(leg.key).toBe('continue');
  });
});

describe('the other setups keep one segment and the simulation', () => {
  const one = (o: Partial<SearchInputs>) => {
    const r = createChainEvaluator({ ...inputs, ...o } as SearchInputs).evaluate([197])!;
    const leg = simLegFromSegments(r.legs, { timeOff: (o.timeOff ?? inputs.timeOff) as never, currentTE: 195, planStart: PLAN_START })!;
    return { r, leg, p: withCurrentSim(plan, leg) as { tableLegs: { simulated?: boolean; timeOff?: unknown }[] } };
  };
  it('no time off', () => {
    const { r, leg, p } = one({ timeOff: [] });
    expect(r.legs).toHaveLength(1);
    expect(leg.timeOff).toBeUndefined();
    expect(p.tableLegs[0].simulated).toBe(true);
  });
  it('time off starting exactly when the first stop is reached: not cut', () => {
    const reach = PLAN_START + 4 * DAY; // 195 -> 197 at two days a TE
    const { r, leg, p } = one({ timeOff: [{ from: reach, to: reach + 2 * DAY }] });
    expect(r.legs).toHaveLength(1);
    expect(leg.timeOff).toBeUndefined();
    expect(p.tableLegs[0]).toMatchObject({ simulated: true });
  });
  it('a no-prestige day only (Oct 27): one segment, kept', () => {
    const { r, leg, p } = one({ timeOff: [] , noPrestige });
    expect(r.legs).toHaveLength(1);
    expect(leg.endTE).toBe(197);
    expect(p.tableLegs[0].simulated).toBe(true);
  });
});
