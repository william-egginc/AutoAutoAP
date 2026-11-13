/**
 * YOUR EGGS, "TO GOAL" PER EGG ON THE FOLLOWED PLAN (spec-myruns-goal, 13 Nov 2026; the game expert's answer,
 * ~/code/aaap-tools/notes/spec-myruns-fix2-gameexpert-answer.md). Each egg's goal is the TE it holds at the plan's
 * end; its time is the end of its LAST stint on the plan. The order comes from the leg's own shift list, never an
 * assumed C4, I2, R2, H2. Hours on: approximate ("by about"). Kindness (K3) waits for the sale: a late bound ("by").
 * No later stint: done on this plan. After a prestige the farm starts on Curiosity. A plan whose final ascension has
 * no shifts (table only, no replay): nothing per egg. Exact plans: each egg's TE share from the final leg's endEggs.
 * Pinned by the line kinds and words functions of lib/yourEggsWords.ts, never by literal player words.
 */
import { describe, expect, it } from 'vitest';
import { eggGoalTimes, goalLegsOf, planEggGoalLines, type GoalLeg } from './eggGoalTimes';
import { eggViewLines } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';
import { dateAt } from './eventWhen';
import { roundToHourIn } from './nowWords';
import { EGG_LINE, EGG_VIEW_LINES, GOAL_EGG_DONE_WORDS, GOAL_NO_SHIFT_WORDS, goalEggWords } from './yourEggsWords';
import type { NowPlan } from './nowPlan';
import type { LegSummary } from '@/search/types';

const H = 3600;
const D = 86400;
const ZONE = 'America/Los_Angeles';
// Fixed instants (no clock): the final ascension starts at T0.
const T0 = Date.parse('2028-03-01T17:00:00Z') / 1000;
const NOW = T0 - 30 * D;

/** A tail-only (table replay) final leg: H1, K3, then a tail in the given order, each stint a day; ends a day later. */
function tailLeg(tail: string[], start = T0): GoalLeg {
  const eggs = ['humility', 'kindness', ...tail];
  return {
    start,
    end: start + (eggs.length + 1) * D,
    shifts: eggs.map((egg, i) => ({ at: start + (i + 1) * D, egg })),
    full: false,
    startEgg: 'curiosity',
  };
}
const at = (i: number, start = T0) => start + (i + 1) * D;

describe('eggGoalTimes: the end of each egg\'s last stint, in the order of the leg\'s own shift list', () => {
  it('standard tail: each egg ends where the farm next moves off it; the egg laid at the end, at the plan\'s end', () => {
    const leg = tailLeg(['curiosity', 'integrity', 'resilience', 'humility']);
    const t = eggGoalTimes({ legs: [leg], now: NOW, hours: false })!;
    // Shifts: 0 H1, 1 K3, 2 C4, 3 I2, 4 R2, 5 H2; the leg ends a day after H2.
    expect(t.kindness).toEqual({ egg: 'kindness', done: false, at: at(2), bound: 'by' });
    expect(t.curiosity).toEqual({ egg: 'curiosity', done: false, at: at(3), bound: 'at' });
    expect(t.integrity).toEqual({ egg: 'integrity', done: false, at: at(4), bound: 'at' });
    expect(t.resilience).toEqual({ egg: 'resilience', done: false, at: at(5), bound: 'at' });
    expect(t.humility).toEqual({ egg: 'humility', done: false, at: leg.end, bound: 'at' });
  });

  it('a non-standard order (hours on picks the best of 24): the times follow the list, not C4, I2, R2, H2', () => {
    const leg = tailLeg(['resilience', 'humility', 'curiosity', 'integrity']);
    const t = eggGoalTimes({ legs: [leg], now: NOW, hours: false })!;
    expect(t.resilience.done === false && t.resilience.at).toBe(at(3));
    expect(t.humility.done === false && t.humility.at).toBe(at(4));
    expect(t.curiosity.done === false && t.curiosity.at).toBe(at(5));
    // Integrity is laid last here: its goal is the plan's end, not the I2 slot of the standard order.
    expect(t.integrity.done === false && t.integrity.at).toBe(leg.end);
    // And the standard order's times would differ for every tail egg.
    const std = eggGoalTimes({ legs: [tailLeg(['curiosity', 'integrity', 'resilience', 'humility'])], now: NOW, hours: false })!;
    for (const egg of ['curiosity', 'integrity', 'resilience', 'humility']) expect(t[egg]).not.toEqual(std[egg]);
  });

  it('Kindness (K3) waits for the sale\'s end: its stint end is a late bound ("by"), the other eggs\' are not', () => {
    const t = eggGoalTimes({ legs: [tailLeg(['curiosity', 'integrity', 'resilience', 'humility'])], now: NOW, hours: false })!;
    expect(t.kindness.done === false && t.kindness.bound).toBe('by');
    for (const egg of ['curiosity', 'integrity', 'resilience', 'humility']) expect(t[egg].done === false && t[egg].bound).toBe('at');
  });

  it('awake hours on: every egg is approximate ("by about"), K3 included', () => {
    const t = eggGoalTimes({ legs: [tailLeg(['curiosity', 'integrity', 'resilience', 'humility'])], now: NOW, hours: true })!;
    for (const egg of ['curiosity', 'integrity', 'resilience', 'humility', 'kindness']) expect(t[egg].done === false && t[egg].bound).toBe('byAbout');
  });

  it('an egg with no later stint booked is done on this plan; one still being laid in its last stint is not', () => {
    const leg = tailLeg(['curiosity', 'integrity', 'resilience', 'humility']);
    // Now: inside I2 (after C4's shift to Integrity, before R2).
    const now = at(3) + H;
    const t = eggGoalTimes({ legs: [leg], now, hours: false })!;
    expect(t.kindness).toEqual({ egg: 'kindness', done: true });
    expect(t.curiosity).toEqual({ egg: 'curiosity', done: true });
    expect(t.integrity.done).toBe(false);
    expect(t.resilience.done).toBe(false);
    expect(t.humility.done).toBe(false);
  });

  it('a table replay\'s final leg lists shifts from H1 on: an egg not in it was last laid in the build, by the first shift', () => {
    // A goal that needs nothing more from Resilience in the tail.
    const leg = tailLeg(['curiosity', 'integrity', 'humility']);
    const t = eggGoalTimes({ legs: [leg], now: NOW, hours: false })!;
    expect(t.resilience).toEqual({ egg: 'resilience', done: false, at: at(0), bound: 'by' });
  });

  it('after a prestige the farm starts on Curiosity: its first stint runs from the start to the first shift', () => {
    // A full (simulated / exact) final leg with no shift back to Curiosity and no `fromEgg`.
    const start = T0;
    const leg: GoalLeg = {
      start,
      end: start + 6 * D,
      shifts: [
        { at: start + 2 * D, egg: 'integrity' },
        { at: start + 3 * D, egg: 'humility' },
        { at: start + 4 * D, egg: 'kindness' },
        { at: start + 5 * D, egg: 'resilience' },
      ],
      full: true,
      startEgg: 'curiosity',
    };
    const t = eggGoalTimes({ legs: [leg], now: NOW, hours: false })!;
    expect(t.curiosity).toEqual({ egg: 'curiosity', done: false, at: start + 2 * D, bound: 'at' });
    // goalLegsOf: a leg after a prestige starts on Curiosity, whichever egg the farm was on before it.
    const plan = exactPlan();
    const legs = goalLegsOf(plan, { saveEgg: 'humility' });
    expect(legs[1].startEgg).toBe('curiosity');
    // The first ascension, carrying on the save's farm ('continue'), starts on the save's egg.
    expect(legs[0].startEgg).toBe('humility');
  });

  it('a full final leg that never lays an egg: its last stint is looked for in the ascensions before', () => {
    const first: GoalLeg = {
      start: T0 - 10 * D,
      end: T0,
      shifts: [{ at: T0 - 8 * D, egg: 'resilience' }, { at: T0 - 5 * D, egg: 'integrity' }],
      full: true,
      startEgg: 'curiosity',
    };
    const last: GoalLeg = { start: T0, end: T0 + 4 * D, shifts: [{ at: T0 + 2 * D, egg: 'humility' }], full: true, startEgg: 'curiosity' };
    const t = eggGoalTimes({ legs: [first, last], now: NOW, hours: false })!;
    expect(t.resilience).toEqual({ egg: 'resilience', done: false, at: T0 - 5 * D, bound: 'at' });
    expect(t.integrity).toEqual({ egg: 'integrity', done: false, at: T0, bound: 'at' });
    // An egg the plan never lays has no later stint: done.
    expect(t.kindness).toEqual({ egg: 'kindness', done: true });
  });

  it('table only, no replay (the final ascension has no shifts): nothing per egg', () => {
    const leg: GoalLeg = { start: T0, end: T0 + 9 * D, shifts: null, full: false, startEgg: 'curiosity' };
    expect(eggGoalTimes({ legs: [leg], now: NOW, hours: false })).toBeNull();
    expect(eggGoalTimes({ legs: [], now: NOW, hours: false })).toBeNull();
  });
});

// --- plans as the page has them (lib/nowPlan.ts NowPlan) ---

const at30 = getThresholdForTE(30);
function exactLeg(o: { start: number; end: number; endTE: number; key?: string; shifts: { at: number; egg: string; fromEgg?: string }[]; endEggs?: LegSummary['endEggs'] }): LegSummary {
  return {
    key: (o.key ?? '2-sale-tier13') as LegSummary['key'],
    endTE: o.endTE,
    durationSeconds: o.end - o.start,
    maxELR: 1e12,
    endTime: o.end,
    startTime: o.start,
    tier13Unlocked: true,
    shifts: o.shifts,
    ...(o.endEggs ? { endEggs: o.endEggs } : {}),
  };
}
/** Two exact ascensions to 210 TE; the final one's endEggs: Curiosity 40, Integrity 45, Humility 42, Resilience 41,
 *  Kindness 42 (VIRTUE_EGGS order: curiosity, integrity, humility, resilience, kindness). */
function exactPlan(): NowPlan {
  const te = [40, 45, 42, 41, 42];
  const legs = [
    exactLeg({ start: T0 - 20 * D, end: T0 - 10 * D, endTE: 180, key: 'continue', shifts: [{ at: T0 - 15 * D, egg: 'curiosity' }] }),
    exactLeg({
      start: T0,
      end: T0 + 7 * D,
      endTE: 210,
      shifts: [
        { at: T0 + 1 * D, egg: 'humility' },
        { at: T0 + 2 * D, egg: 'kindness' },
        { at: T0 + 3 * D, egg: 'integrity' },
        { at: T0 + 4 * D, egg: 'resilience' },
        { at: T0 + 5 * D, egg: 'curiosity' },
        { at: T0 + 6 * D, egg: 'humility' },
      ],
      endEggs: { delivered: te.map(n => getThresholdForTE(n)), te, egg: 'humility' },
    }),
  ];
  return {
    goal: 'fastest',
    deadline: null,
    chain: [180, 210],
    end: T0 + 7 * D,
    endTE: 210,
    legs,
    tableLegs: null,
    exact: true,
    instantTE: null,
    calculatedAt: 0,
    planStart: T0 - 20 * D,
    spareHours: null,
  } as NowPlan;
}
function tablePlan(withReplay: boolean): NowPlan {
  return {
    goal: 'fastest',
    deadline: null,
    chain: [180, 210],
    end: T0 + 7 * D,
    endTE: 210,
    legs: null,
    tableLegs: [
      { to: 180, endTE: 180, start: T0 - 20 * D, end: T0 - 10 * D },
      withReplay
        ? { to: 210, endTE: 210, start: T0, end: T0 + 7 * D, shifts: tailLeg(['curiosity', 'integrity', 'resilience', 'humility']).shifts!.map(s => ({ ...s })) }
        : { to: 210, endTE: 210, start: T0, end: T0 + 7 * D },
    ],
    exact: false,
    instantTE: null,
    calculatedAt: 0,
    planStart: T0 - 20 * D,
    spareHours: null,
  } as NowPlan;
}
const when = (t: number, rounded = false) => dateAt(rounded ? roundToHourIn(t, ZONE) : t, NOW, ZONE, true);

describe('planEggGoalLines: each egg\'s line in the "to goal" view', () => {
  it('an Exact plan: each egg\'s TE share from the final leg\'s endEggs, to the minute, Kindness "by"', () => {
    const l = planEggGoalLines({ plan: exactPlan(), now: NOW, zone: ZONE, hours: false, saveEgg: 'curiosity' })!;
    expect(l.curiosity).toEqual({ kind: EGG_LINE.goalEggAt, text: goalEggWords(40, when(T0 + 6 * D), 'at') });
    expect(l.integrity).toEqual({ kind: EGG_LINE.goalEggAt, text: goalEggWords(45, when(T0 + 4 * D), 'at') });
    expect(l.resilience).toEqual({ kind: EGG_LINE.goalEggAt, text: goalEggWords(41, when(T0 + 5 * D), 'at') });
    expect(l.humility).toEqual({ kind: EGG_LINE.goalEggAt, text: goalEggWords(42, when(T0 + 7 * D), 'at') });
    expect(l.kindness).toEqual({ kind: EGG_LINE.goalEggBy, text: goalEggWords(42, when(T0 + 3 * D), 'by') });
  });

  it('awake hours on: "by about", to the hour', () => {
    const l = planEggGoalLines({ plan: exactPlan(), now: NOW, zone: ZONE, hours: true, saveEgg: 'curiosity' })!;
    expect(l.curiosity).toEqual({ kind: EGG_LINE.goalEggByAbout, text: goalEggWords(40, when(T0 + 6 * D, true), 'byAbout') });
    for (const x of Object.values(l)) expect(x.kind).toBe(EGG_LINE.goalEggByAbout);
  });

  it('done on this plan once the last stint is over', () => {
    const l = planEggGoalLines({ plan: exactPlan(), now: T0 + 3 * D + H, zone: ZONE, hours: false, saveEgg: 'curiosity' })!;
    expect(l.kindness).toEqual({ kind: EGG_LINE.goalEggDone, text: GOAL_EGG_DONE_WORDS });
    expect(l.integrity.kind).toBe(EGG_LINE.goalEggAt);
  });

  it('a table replay plan: times from its final leg\'s shifts, to the hour (not exact), no TE share', () => {
    const l = planEggGoalLines({ plan: tablePlan(true), now: NOW, zone: ZONE, hours: false, saveEgg: 'curiosity' })!;
    expect(l.integrity).toEqual({ kind: EGG_LINE.goalEggAt, text: goalEggWords(null, when(at(4), true), 'at') });
    expect(l.kindness).toEqual({ kind: EGG_LINE.goalEggBy, text: goalEggWords(null, when(at(2), true), 'by') });
  });

  it('table only, no replay: nothing per egg, and the view keeps its plan-shift lines (no shift here: said so)', () => {
    expect(planEggGoalLines({ plan: tablePlan(false), now: NOW, zone: ZONE, hours: false, saveEgg: 'curiosity' })).toBeNull();
    const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
    const egg = eggLines(delivered, {}, 'curiosity', 1e12, null).find(e => e.egg === 'integrity')!;
    const v = eggViewLines('goal', egg, {
      now: NOW,
      saveSeconds: NOW,
      clockLines: { next: {}, goal: { integrity: GOAL_NO_SHIFT_WORDS } },
      goalTimes: null,
    });
    expect(v.map(x => x.kind)).toEqual([EGG_LINE.goalNoShift]);
  });

  it('eggViewLines: with goal times, the "to goal" view shows the egg\'s goal time only; "next TE" never does', () => {
    const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
    const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);
    const goalTimes = planEggGoalLines({ plan: exactPlan(), now: NOW, zone: ZONE, hours: false, saveEgg: 'curiosity' })!;
    const clockLines = { next: {}, goal: Object.fromEntries(eggs.map(e => [e.egg, GOAL_NO_SHIFT_WORDS])) };
    for (const e of eggs) {
      const g = eggViewLines('goal', e, { now: NOW, saveSeconds: NOW, clockLines, goalTimes });
      expect(g).toEqual([goalTimes[e.egg]]);
      for (const x of g) expect(EGG_VIEW_LINES.goal).toContain(x.kind);
      const n = eggViewLines('next', e, { now: NOW, saveSeconds: NOW, clockLines, goalTimes });
      for (const x of n) expect(EGG_VIEW_LINES.next).toContain(x.kind);
    }
  });
});
