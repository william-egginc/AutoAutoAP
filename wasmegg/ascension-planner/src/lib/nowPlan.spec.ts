import { describe, expect, it } from 'vitest';
import type { LegSummary } from '@/search/types';
import {
  ascensionAt,
  onTrack,
  planEvents,
  planFromSnapshot,
  planTEAt,
  shiftsAfter,
  tableEvents,
  trackWords,
  type SnapLike,
} from './nowPlan';

const H = 3600;
const T0 = 1_792_000_000; // the plan start
const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts'], endEgg: { egg: string; te: number }) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts, endEgg }) as LegSummary;

// Two ascensions: A1 from 186 TE (Curiosity 40 → Integrity, then Humility), prestige at 190; A2 to 200.
const legs: LegSummary[] = [
  leg(T0, T0 + 10 * H, 190, [
    { at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
    { at: T0 + 6 * H, egg: 'humility', fromEgg: 'integrity', te: 39 },
  ], { egg: 'humility', te: 38 }),
  leg(T0 + 11 * H, T0 + 30 * H, 200, [
    { at: T0 + 15 * H, egg: 'kindness', fromEgg: 'resilience', te: 37 },
  ], { egg: 'kindness', te: 46 }),
];
const teStart = [40, 37, 36, 37, 36]; // 186 in the save's order: Curiosity, Integrity, Humility, Resilience, Kindness

const route = (chain: number[], end: number) => ({
  chain,
  end,
  legs: chain.map((to, i) => ({ to, endTE: to, start: T0 + i * 11 * H, end: i === chain.length - 1 ? end : T0 + (i * 11 + 10) * H })),
});
const snap: SnapLike = {
  at: (T0 - 600) * 1000,
  result: { best: route([190, 200], T0 + 31 * H), byAscensions: [null, route([200], T0 + 40 * H), route([190, 200], T0 + 31 * H)] },
  exact: { '190,200': { end: T0 + 30 * H, endTE: 200, legs }, '200': { end: T0 + 42 * H, endTE: 200 } },
  answerStart: T0,
  meta: { account: 'acc', goal: 'target 200', backupTime: T0 - 1800, teByEgg: teStart },
};

describe('planFromSnapshot', () => {
  it('Fastest: Check exactly’s soonest route, its legs and the runner-up gap', () => {
    const p = planFromSnapshot(snap, 'fastest')!;
    expect(p.chain).toEqual([190, 200]);
    expect(p.exact).toBe(true);
    expect(p.legs).toHaveLength(2);
    expect(p.runnerUpHours).toBe(12);
    expect(p.calculatedAt).toBe(snap.at);
    expect(p.planStart).toBe(T0);
  });

  it('Fastest without the exact check: the table’s best, no legs', () => {
    const p = planFromSnapshot({ ...snap, exact: {} }, 'fastest')!;
    expect(p.exact).toBe(false);
    expect(p.legs).toBeNull();
    expect(p.tableLegs).toHaveLength(2);
    expect(p.runnerUpHours).toBe(9);
  });

  it('By a date: the exact answer, its spare, the instant TE, and the runner-up', () => {
    const deadline = T0 + 40 * H;
    const date: SnapLike = {
      ...snap,
      result: { ...snap.result, byDate: route([190, 200], T0 + 31 * H), byDateByAscensions: [] },
      dateExact: { chain: [190, 200], endTE: 200, end: T0 + 30 * H },
      dateExactByK: { 1: { chain: [200], endTE: 200, end: T0 + 33 * H }, 2: { chain: [190, 200], endTE: 200, end: T0 + 30 * H } },
    };
    const p = planFromSnapshot(date, 'date', deadline)!;
    expect(p.endTE).toBe(200);
    expect(p.instantTE).toBe(200);
    expect(p.spareHours).toBe(10);
    expect(p.runnerUpHours).toBe(3);
    const lower = { ...date, dateExactByK: { 1: { chain: [199], endTE: 199, end: T0 } } };
    expect(planFromSnapshot(lower, 'date', deadline)!.runnerUpHours).toBe(Infinity);
    expect(planFromSnapshot({ ...date, dateExactByK: {} }, 'date', deadline)!.runnerUpHours).toBeNull();
  });

  it('nothing without an answer', () => {
    expect(planFromSnapshot(null, 'fastest')).toBeNull();
    expect(planFromSnapshot({ at: 1, result: { best: null, byAscensions: [] } }, 'fastest')).toBeNull();
  });
});

describe('planEvents and the table', () => {
  const p = planFromSnapshot(snap, 'fastest')!;
  it('lists shifts, the prestige and the goal in order, with past and next', () => {
    const ev = planEvents(p, T0 + 3 * H);
    expect(ev.map(e => `${e.kind}:${e.egg ?? e.te}`)).toEqual([
      'shift:integrity',
      'shift:humility',
      'prestige:190',
      'shift:kindness',
      'goal:200',
    ]);
    expect(ev[0].past).toBe(true);
    expect(ev[1].next).toBe(true);
    expect(ev.filter(e => e.next)).toHaveLength(1);
  });

  it('shows the last passed, what is ahead to the next prestige, and the goal', () => {
    const shown = tableEvents(planEvents(p, T0 + 3 * H));
    expect(shown.map(e => e.kind)).toEqual(['shift', 'shift', 'prestige', 'goal']);
    expect(shown[0].past).toBe(true);
  });

  it('By a date ends with the date itself, with its spare', () => {
    const d = { ...p, goal: 'date' as const, deadline: T0 + 40 * H, spareHours: 10 };
    const ev = planEvents(d, T0);
    expect(ev[ev.length - 1]).toMatchObject({ kind: 'goal', at: T0 + 40 * H, te: 200, spareHours: 10 });
    expect(ev.filter(e => e.kind === 'prestige')).toHaveLength(2);
  });

  it('without the exact legs: the prestiges from the table, no shifts', () => {
    const t = planFromSnapshot({ ...snap, exact: {} }, 'fastest')!;
    expect(planEvents(t, T0).map(e => e.kind)).toEqual(['prestige', 'goal']);
    expect(shiftsAfter(t, T0)).toBeNull();
  });

  it('counts the shifts still to come and the ascension the clock is in', () => {
    expect(shiftsAfter(p, T0)).toBe(3);
    expect(shiftsAfter(p, T0 + 3 * H)).toBe(2);
    expect(ascensionAt(p, T0 - 1)).toBe(0);
    expect(ascensionAt(p, T0 + H)).toBe(1);
    expect(ascensionAt(p, T0 + 12 * H)).toBe(2);
    expect(ascensionAt(p, T0 + 99 * H)).toBe(2);
  });
});

describe('on track', () => {
  const p = planFromSnapshot(snap, 'fastest')!;
  it('reads the plan’s TE line from each shift’s TE', () => {
    expect(planTEAt(legs, teStart, T0)).toBe(186);
    expect(planTEAt(legs, teStart, T0 + 2 * H)).toBe(187); // Curiosity 41
    expect(planTEAt(legs, teStart, T0 + 4 * H)).toBe(188); // Integrity halfway 37 → 39
    expect(planTEAt(legs, teStart, T0 + 10 * H)).toBe(191); // Humility ends on 38: one past the stop
  });

  // R6 (21 Oct 2026): onTrack is now a thin wrapper over lib/planPace.ts, shared with My runs' saved plans. Wording
  // changed with it (Jordan's OK): "On plan" within 30 minutes is "On schedule (within an hour)", hours are whole
  // ("3 hours behind", days from 48 h), behind is negative hours, and a plan without its shift TEs or without the
  // exact legs is compared leg by leg ("rough") instead of "Can't tell". planPace.spec.ts has every case.
  it('a newer save: hours ahead or behind of where the plan expected it', () => {
    // At T0 + 2 h the plan expected 187; a save with 188 is where the plan is at T0 + 4 h: 2 h ahead.
    const ahead = onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(ahead.kind).toBe('ahead');
    expect((ahead as { hours: number }).hours).toBeCloseTo(2, 1);
    const behind = onTrack(p, { seconds: T0 + 10 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(behind.kind).toBe('behind');
    expect((behind as { hours: number }).hours).toBeCloseTo(-6, 1);
    expect(onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 37, 36, 37, 36] }).kind).toBe('on-schedule');
    // The save's progress (planPace `progressOf`) when given: 187.6 at T0 + 2 h is 1.2 h ahead.
    expect(onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 37, 36, 37, 36], progress: 187.6 }).kind).toBe('ahead');
  });

  it('says plainly when it can’t tell, and compares leg by leg when it can only do that', () => {
    expect(onTrack(p, { seconds: snap.meta!.backupTime, teByEgg: teStart }).kind).toBe('same-save');
    expect(onTrack({ ...p, legs: null, tableLegs: null }, { seconds: T0 + H, teByEgg: teStart })).toEqual({
      kind: 'cant',
      why: 'no-timeline',
    });
    // Without the exact legs: the table's legs, leg by leg, an estimate when the plan isn't Check exactly's.
    const table = onTrack({ ...p, legs: null, exact: false }, { seconds: T0 + 5 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(table).toMatchObject({ kind: 'on-schedule', rough: true, estimate: true });
    expect(onTrack({ ...p, meta: { ...p.meta!, teByEgg: undefined } }, { seconds: T0 + H, teByEgg: teStart })).toEqual({
      kind: 'cant',
      why: 'no-te',
    });
    expect(onTrack(p, { seconds: T0 - 600, teByEgg: teStart })).toEqual({ kind: 'cant', why: 'not-started', start: T0 });
    const noTE = { ...p, legs: legs.map(l => ({ ...l, shifts: l.shifts!.map(s => ({ ...s, te: undefined })) })) };
    expect(onTrack(noTE, { seconds: T0 + H, teByEgg: [41, 37, 36, 37, 36] })).toMatchObject({ rough: true });
  });

  it('words the chip (planPace’s words, with the save’s time)', () => {
    const ahead = onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(trackWords(ahead, T0 + 3 * H, 'UTC')).toEqual({ tone: 'ok', text: '2 hours ahead, as of 7:46 pm' });
    const behind = onTrack(p, { seconds: T0 + 10 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(trackWords(behind, T0 + 10 * H, 'UTC')).toEqual({ tone: 'bad', text: '6 hours behind, as of 3:46 am' });
    expect(trackWords({ kind: 'cant', why: 'no-timeline' }, T0, 'UTC').text).toBe("Can't tell: saved without its timeline");
    expect(trackWords({ kind: 'same-save' }, T0, 'UTC').text).toBe('Made from your latest save');
  });
});
