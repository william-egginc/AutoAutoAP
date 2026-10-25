/**
 * A new result when the player follows a route (lib/searchPlan.ts, 23 Oct 2026): the two paths ('takeover' without a
 * followed route, unchanged; 'prompt' with one), the "better" rule against the followed route, the prompt's words
 * (12-hour times), its id and "Keep mine" remembered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KEEP_MINE_KEY,
  betterRouteWords,
  betterThanFollowed,
  drivingPlan,
  followIsPriced,
  followPrompt,
  keepMine,
  mayPrompt,
  newResultPath,
  readKeptMine,
  resultId,
  type SnapSearch,
} from './searchPlan';
import { dateAt } from './eventWhen';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 23, 18) / 1000; // Fri Oct 23, 12:00 pm Denver
const H = 3600;
const D = 86400;
const when = (t: number) => dateAt(t, NOW, ZONE);
const DEADLINE = NOW + 30 * D;

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe('the two paths', () => {
  it('no followed route: takeover (the instant-first rule); a followed route: prompt', () => {
    expect(newResultPath(false)).toBe('takeover');
    expect(newResultPath(true)).toBe('prompt');
  });
  it('the takeover path is unchanged: a result that makes the date drives instead of the instant answer', () => {
    const snap = {
      at: NOW * 1000,
      result: { best: null, byAscensions: [], byDate: { chain: [200, 240], end: DEADLINE - 2 * D, legs: [{ to: 200, endTE: 200, start: NOW, end: NOW + D }, { to: 240, endTE: 240, start: NOW + D, end: DEADLINE - 2 * D }] } },
      exact: {},
    };
    const found: SnapSearch = { level: 'Fast', chain: [201, 239], end: DEADLINE - 3 * D, endTE: 239, legs: [], at: NOW * 1000 + 5, planStart: NOW };
    const d = drivingPlan(snap as never, 'date', DEADLINE, { live: found });
    expect(d.takeover).toBe('makes-date');
    expect(d.plan?.chain).toEqual([201, 239]);
  });
});

describe('better than the followed route', () => {
  it('Fastest: sooner by at least a minute', () => {
    expect(betterThanFollowed('fastest', null, { end: NOW + 10 * H, endTE: 490 }, { end: NOW + 11 * H, endTE: 490 })).toBe(true);
    expect(betterThanFollowed('fastest', null, { end: NOW + 10 * H - 30, endTE: 490 }, { end: NOW + 10 * H, endTE: 490 })).toBe(false);
    expect(betterThanFollowed('fastest', null, { end: NOW + 12 * H, endTE: 490 }, { end: NOW + 11 * H, endTE: 490 })).toBe(false);
    expect(betterThanFollowed('fastest', null, { end: NOW, endTE: 490 }, null)).toBe(false);
  });
  it('By a date: makes the date when the followed one does not; more TE; the same TE with more to spare', () => {
    const late = { end: DEADLINE + H, endTE: 250 };
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H, endTE: 240 }, late)).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE + 2 * H, endTE: 260 }, late)).toBe(false);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H, endTE: 241 }, { end: DEADLINE - 9 * H, endTE: 240 })).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - 9 * H, endTE: 239 }, { end: DEADLINE - H, endTE: 240 })).toBe(false);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - 5 * H, endTE: 240 }, { end: DEADLINE - H, endTE: 240 })).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H - 10, endTE: 240 }, { end: DEADLINE - H, endTE: 240 })).toBe(false);
  });
});

describe('the prompt', () => {
  const followed = { chain: [222, 490], at: NOW * 1000 - 60_000, finish: { end: NOW + 3 * D, endTE: 490 } };
  const candidate = { chain: [230, 490], end: NOW + 2 * D, endTE: 490, at: NOW * 1000, source: 'fast' as const, planStart: NOW };
  const base = { goalKey: 'fastest-490', goal: 'fastest' as const, deadline: null, followed, candidate, keptMine: [] as string[], when };

  it('asks with both finishes in 12-hour times', () => {
    const p = followPrompt(base)!;
    expect(p.words).toBe(
      "This is a better route than the one you're following (this one: Oct 25 at 12:00 pm; yours: Oct 26 at 12:00 pm). Do you want to follow it?"
    );
    expect(p.chain).toEqual([230, 490]);
    expect(p.source).toBe('fast');
    expect(p.id).toBe(resultId('fastest-490', 'fast', [230, 490], NOW + 2 * D));
  });
  it('By a date says TE and spare', () => {
    expect(betterRouteWords('date', DEADLINE, { end: DEADLINE - 2.5 * D, endTE: 241 }, { end: DEADLINE + 3 * H, endTE: 240 }, when)).toBe(
      "This is a better route than the one you're following (this one: 241 TE, 2.5 days to spare; yours: 240 TE, lands after the date). Do you want to follow it?"
    );
  });
  it('not shown: no followed route, the same route, not newer than the follow, not better, or Keep mine pressed', () => {
    expect(followPrompt({ ...base, followed: null })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, chain: [222, 490] } })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, at: followed.at } })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, end: NOW + 4 * D } })).toBeNull();
    expect(followPrompt({ ...base, followed: { ...followed, finish: null } })).toBeNull();
    const id = followPrompt(base)!.id;
    expect(followPrompt({ ...base, keptMine: [id] })).toBeNull();
  });
  it('Keep mine is remembered in this browser per result; an instant answer\'s id leaves its time out', () => {
    keepMine('a');
    keepMine('b');
    keepMine('a');
    expect(readKeptMine()).toEqual(['b', 'a']);
    expect(JSON.parse(mem.get(KEEP_MINE_KEY)!)).toEqual(['b', 'a']);
    expect(resultId('fastest-490', 'instant', [230, 490], 1)).toBe(resultId('fastest-490', 'instant', [230, 490], 99999));
    expect(resultId('fastest-490', 'fast', [230, 490], 60)).not.toBe(resultId('fastest-490', 'fast', [230, 490], 6000));
  });
});

describe('an instant answer never asks about a PRICED follow (Jordan, 23 Oct 2026)', () => {
  // The reported case: Egg Day, the instant card's 314 TE with 9.7 h to spare against his followed 313 TE with 1.4 days
  // to spare, a route his own Fast run had priced.
  const route = [197, 228, 257, 285, 313];
  const followedFinish = { end: DEADLINE - 1.4 * D, endTE: 313 };
  const instant = { chain: [197, 228, 257, 285, 314], end: DEADLINE - 9.7 * H, endTE: 314, at: NOW * 1000, source: 'instant' as const, planStart: NOW };
  const base = (priced: boolean) => ({
    goalKey: 'eggday-2027',
    goal: 'date' as const,
    deadline: DEADLINE,
    followed: { chain: route, at: NOW * 1000 - 3 * H * 1000, finish: followedFinish, priced },
    candidate: instant,
    keptMine: [] as string[],
    when,
  });

  it('the reported case: 314 TE / 9.7 h against a follow priced by his Fast run asks nothing', () => {
    const priced = followIsPriced({ source: 'instant', chain: route, results: [[197, 228, 257, 285, 313]] });
    expect(priced).toBe(true);
    expect(followPrompt(base(priced))).toBeNull();
  });
  it('the same instant answer against an UNPRICED follow (typed, a board row, an older instant answer) still asks', () => {
    for (const source of ['manual', 'instant', null]) expect(followIsPriced({ source, chain: route, results: [] })).toBe(false);
    expect(followPrompt(base(false))?.words).toBe(
      "This is a better route than the one you're following (this one: 314 TE, 9.7 h to spare; yours: 313 TE, 1.4 days to spare). Do you want to follow it?"
    );
  });
  it('a Fast, Exact or Custom result that is better asks against a priced follow too (the existing rules)', () => {
    for (const source of ['fast', 'exact', 'custom'] as const) {
      const p = followPrompt({ ...base(true), candidate: { ...instant, source } });
      expect(p?.source).toBe(source);
    }
    // ...and not when it isn't better.
    expect(followPrompt({ ...base(true), candidate: { ...instant, source: 'fast', endTE: 312, chain: [197, 228, 257, 285, 312] } })).toBeNull();
  });
  it("priced: a fast/exact/custom source, Right now's finish from a priced result, or a kept result with the same route (stops passed in front too)", () => {
    for (const source of ['fast', 'exact', 'custom']) expect(followIsPriced({ source, chain: route })).toBe(true);
    expect(followIsPriced({ source: 'instant', chain: route, pricedByResult: true })).toBe(true);
    expect(followIsPriced({ source: 'instant', chain: [228, 257, 285, 313], results: [[166, 197, 228, 257, 285, 313]] })).toBe(true);
    expect(followIsPriced({ source: 'instant', chain: route, results: [[166, 197, 228, 257, 285, 310]] })).toBe(false);
  });
  it('mayPrompt: only an instant answer is held back, and only by a priced follow', () => {
    expect(mayPrompt('instant', true)).toBe(false);
    expect(mayPrompt('instant', false)).toBe(true);
    for (const s of ['fast', 'exact', 'custom'] as const) {
      expect(mayPrompt(s, true)).toBe(true);
      expect(mayPrompt(s, false)).toBe(true);
    }
  });
});

/**
 * A PRICED RESULT OVER AN INSTANT FOLLOW (math review 24 Oct 2026, verified, finding 1): a route followed from the
 * instant answer with no simulated price keeps the table's estimate as its finish, optimistic by days with hours on. A
 * Fast, Exact or Custom result asks about it without comparing, in words that don't call it "better".
 */
describe('a simulated result against an instant-sourced follow', () => {
  const at = (iso: string) => Date.parse(iso) / 1000;
  const estimate = at('2028-09-21T08:08:00Z'); // Sep 21 2028, 2:08 am Denver: the instant answer's estimate
  const fastEnd = at('2028-09-21T14:22:00Z'); // Sep 21 2028, 8:22 am Denver: the Fast run, simulated
  const followed = { chain: [196, 221, 241, 260, 287, 328, 359, 490], at: NOW * 1000 - 60_000, finish: { end: estimate, endTE: 490 }, source: 'instant', priced: false };
  const candidate = { chain: [196, 221, 245, 260, 287, 328, 331, 490], end: fastEnd, endTE: 490, at: NOW * 1000, source: 'fast' as const, planStart: NOW };
  const base = { goalKey: 'fastest-490', goal: 'fastest' as const, deadline: null, followed, candidate, keptMine: [] as string[], when };

  it('the verified case: Sep 21, 8:22 am (Fast) is offered over the Sep 21, 2:08 am estimate', () => {
    expect(betterThanFollowed('fastest', null, candidate, followed.finish)).toBe(false);
    const p = followPrompt(base);
    expect(p?.chain).toEqual(candidate.chain);
    expect(p?.words).toBe(
      "Your Fast run, simulated on your account, finishes Sep 21, 2028 at 8:22 am; the route you follow is the instant answer's estimate (Sep 21, 2028 at 2:08 am). Do you want to follow the Fast run's route?"
    );
    expect(p?.words).not.toContain('better');
  });

  it('only over an unpriced instant follow: a priced one, or a typed one, keeps the comparison', () => {
    expect(followPrompt({ ...base, followed: { ...followed, priced: true } })).toBeNull();
    expect(followPrompt({ ...base, followed: { ...followed, source: 'manual' } })).toBeNull();
    expect(followPrompt({ ...base, followed: { ...followed, source: 'fast', priced: true } })).toBeNull();
    // An instant answer still never asks about a priced follow, and against an unpriced one it compares.
    expect(followPrompt({ ...base, followed: { ...followed, priced: true }, candidate: { ...candidate, source: 'instant', end: estimate - H } })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, source: 'instant' } })).toBeNull();
  });

  it('By a date (Egg Day with time off): a simulated 310 that makes the date is offered over an estimated 312; one that lands after it is not', () => {
    const f = { ...followed, chain: [196, 221, 241, 260, 284, 312], finish: { end: DEADLINE - 2 * D, endTE: 312 } };
    const c = { ...candidate, chain: [196, 221, 241, 260, 284, 310], end: DEADLINE - 3 * H, endTE: 310 };
    const date = { ...base, goalKey: `date-${DEADLINE}`, goal: 'date' as const, deadline: DEADLINE, followed: f, candidate: c };
    expect(betterThanFollowed('date', DEADLINE, c, f.finish)).toBe(false);
    expect(followPrompt(date)?.words).toBe(
      "Your Fast run, simulated on your account, gets 310 TE, 3 h to spare; the route you follow is the instant answer's estimate (312 TE, 2.0 days to spare). Do you want to follow the Fast run's route?"
    );
    expect(followPrompt({ ...date, candidate: { ...c, end: DEADLINE + H } })).toBeNull();
  });

  it('not newer than the follow, or Keep mine pressed: nothing, as before', () => {
    expect(followPrompt({ ...base, candidate: { ...candidate, at: followed.at } })).toBeNull();
    const p = followPrompt(base)!;
    expect(followPrompt({ ...base, keptMine: [p.id] })).toBeNull();
  });
});
