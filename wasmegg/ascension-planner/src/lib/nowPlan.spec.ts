import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFER_KEY, PREFER_OFF } from '@/search/preferFewer';
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
    // Prefer fewer Off (the 12 h default would pick the 1-ascension route 9 h behind: see the box's route below).
    const p = planFromSnapshot({ ...snap, exact: {} }, 'fastest', null, PREFER_OFF)!;
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
    const t = planFromSnapshot({ ...snap, exact: {} }, 'fastest', null, PREFER_OFF)!;
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
    // At T0 + 10 h the plan expected 191; 188 is behind by the time since the plan had its 189th TE (T0 + 6 h).
    const behind = onTrack(p, { seconds: T0 + 10 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(behind.kind).toBe('behind');
    expect((behind as { hours: number }).hours).toBeCloseTo(-4, 1);
    expect(onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 37, 36, 37, 36] }).kind).toBe('on-schedule');
    // Whole TE only (22 Oct 2026): a fraction toward the next TE counts for nothing, so 187.6 is 187, on schedule.
    expect(onTrack(p, { seconds: T0 + 2 * H, teByEgg: [41, 37, 36, 37, 36], progress: 187.6 }).kind).toBe('on-schedule');
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
    expect(trackWords(ahead, T0 + 3 * H, 'UTC')).toEqual({ tone: 'ok', text: '2 hours ahead, as of 7:46 PM' });
    const behind = onTrack(p, { seconds: T0 + 10 * H, teByEgg: [41, 38, 36, 37, 36] });
    expect(trackWords(behind, T0 + 10 * H, 'UTC')).toEqual({ tone: 'bad', text: '4 hours behind, as of 3:46 AM' });
    expect(trackWords({ kind: 'cant', why: 'no-timeline' }, T0, 'UTC').text).toBe("Can't tell: saved without its timeline");
    expect(trackWords({ kind: 'same-save' }, T0, 'UTC').text).toBe('Made from your latest save');
  });
});

describe('planFromSnapshot: the route the green box shows (Prefer fewer, 26 Oct 2026)', () => {
  afterEach(() => vi.unstubAllGlobals());
  // A race to 200: 3 ascensions the fastest, 2 ascensions 10 h later, 1 ascension 20 h later.
  const race: SnapLike = {
    at: (T0 - 600) * 1000,
    result: {
      best: route([188, 194, 200], T0 + 30 * H),
      byAscensions: [null, route([200], T0 + 50 * H), route([194, 200], T0 + 40 * H), route([188, 194, 200], T0 + 30 * H)],
    },
    exact: {},
    answerStart: T0,
  };
  const twelve = { kind: 'time' as const, seconds: 12 * H };

  it('a race: the route with the fewest ascensions within 12 h, no runner-up; Off: the fastest', () => {
    const p = planFromSnapshot(race, 'fastest', null, twelve)!;
    expect(p.chain).toEqual([194, 200]);
    expect(p.end).toBe(T0 + 40 * H);
    expect(p.exact).toBe(false);
    expect(p.tableLegs).toHaveLength(2);
    expect(p.runnerUp).toBeNull();
    expect(p.runnerUpHours).toBeNull();
    expect(planFromSnapshot(race, 'fastest', null, { kind: 'time', seconds: 24 * H })!.chain).toEqual([200]);
    const off = planFromSnapshot(race, 'fastest', null, PREFER_OFF)!;
    expect(off.chain).toEqual([188, 194, 200]);
    expect(off.runnerUpHours).toBe(10);
  });

  it('a date: the route with the fewest ascensions reaching the same TE; Off: the highest TE', () => {
    // Every route has over a day to spare: none is tight (a tight one is not picked over a best with room, ux34-c).
    const deadline = T0 + 80 * H;
    const date: SnapLike = {
      ...race,
      result: {
        best: null,
        byAscensions: [],
        byDate: route([188, 194, 200], T0 + 30 * H),
        byDateByAscensions: [null, route([199], T0 + 20 * H), route([194, 200], T0 + 45 * H), route([188, 194, 200], T0 + 30 * H)],
      },
    };
    const same = planFromSnapshot(date, 'date', deadline, { kind: 'te', te: 0 })!;
    expect(same.chain).toEqual([194, 200]);
    expect(same.endTE).toBe(200);
    expect(same.instantTE).toBe(200);
    expect(same.spareHours).toBe(35);
    expect(same.runnerUp).toBeNull();
    // Within 1 TE: the 1-ascension route at 199.
    expect(planFromSnapshot(date, 'date', deadline, { kind: 'te', te: 1 })!.chain).toEqual([199]);
    const off = planFromSnapshot(date, 'date', deadline, PREFER_OFF)!;
    expect(off.chain).toEqual([188, 194, 200]);
    expect(off.spareHours).toBe(50);
  });

  it('by default the margin stored for the screen (the defaults without one): within 12 h, same TE; a stored Off', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    expect(planFromSnapshot(race, 'fastest')!.chain).toEqual([194, 200]);
    store.set(PREFER_KEY, JSON.stringify({ fastest: PREFER_OFF }));
    expect(planFromSnapshot(race, 'fastest')!.chain).toEqual([188, 194, 200]);
  });

  it('Check exactly’s prices (answers saved before 23 Oct 2026) keep their own soonest', () => {
    expect(planFromSnapshot(snap, 'fastest', null, twelve)!.chain).toEqual([190, 200]);
  });
});
