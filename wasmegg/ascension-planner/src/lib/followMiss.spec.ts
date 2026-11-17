/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov "no better-route offer
 * on My runs"): a By a date goal is followed and the finish worked out again from the newest save is later than the
 * goal's date. Pure rule; the card shows it (RightNowCard.followMisses.spec.ts).
 */
import { describe, expect, it } from 'vitest';
import { FOLLOW_BELOW_ON, FOLLOW_CANNOT_ON, followBelowOf, followCannotOf, followMissOf, plansOfThisSave, workedOutHereAt } from './followMiss';
import { FOLLOW_BELOW_BUTTON, FOLLOW_BELOW_LINE, FOLLOW_BELOW_NOTE } from './followMissWords';

const DEADLINE = Date.UTC(2027, 6, 14, 16) / 1000;
const H = 3600;

describe('followMissOf', () => {
  it('a miss: a date goal, a finish after the date', () => {
    expect(followMissOf({ goal: 'date', deadline: DEADLINE, finish: DEADLINE + 5 * H })).toEqual({
      finish: DEADLINE + 5 * H,
      deadline: DEADLINE,
      lateSeconds: 5 * H,
    });
  });
  it('on time: a finish at or before the date is no miss', () => {
    expect(followMissOf({ goal: 'date', deadline: DEADLINE, finish: DEADLINE - H })).toBeNull();
    expect(followMissOf({ goal: 'date', deadline: DEADLINE, finish: DEADLINE })).toBeNull();
  });
  it('no date goal: Fastest has no date to miss, whatever the numbers', () => {
    expect(followMissOf({ goal: 'fastest', deadline: DEADLINE, finish: DEADLINE + H })).toBeNull();
    expect(followMissOf({ goal: 'fastest', deadline: null, finish: DEADLINE + H })).toBeNull();
  });
  it('no date or no finish known: nothing to say', () => {
    expect(followMissOf({ goal: 'date', deadline: null, finish: DEADLINE + H })).toBeNull();
    expect(followMissOf({ goal: 'date', deadline: DEADLINE, finish: null })).toBeNull();
    expect(followMissOf({ goal: 'date', deadline: DEADLINE, finish: Number.NaN })).toBeNull();
    expect(followMissOf({ goal: undefined, deadline: DEADLINE, finish: DEADLINE + H })).toBeNull();
  });
});

// ---------------------------------------------------------------- "Look for a better route" found nothing faster
import { followLookNothingBetter, followLook } from './followMiss';
import { followNoBetterLine } from './followMissWords';

describe('followLookNothingBetter (spec-myruns-nobetter, Jordan, 16 Nov 2026)', () => {
  const miss = { finish: DEADLINE + 50 * H, deadline: DEADLINE, lateSeconds: 50 * H };
  const search = (end: number, at: number, level = 'Fast') => ({ level, at, end });
  it('true: asked, then a search finished after the ask that is not faster than the followed route', () => {
    expect(followLookNothingBetter({ askedAt: 1000, search: search(miss.finish, 2000), miss })).toBe(true);
    expect(followLookNothingBetter({ askedAt: 1000, search: search(miss.finish + 9 * H, 2000), miss })).toBe(true);
  });
  it('a result within a minute of the followed finish is the same route, so still nothing faster', () => {
    expect(followLookNothingBetter({ askedAt: 1000, search: search(miss.finish - 30, 2000), miss })).toBe(true);
  });
  it('false: a faster result, an older result, no ask, no result, no miss', () => {
    expect(followLookNothingBetter({ askedAt: 1000, search: search(miss.finish - 2 * H, 2000), miss })).toBe(false);
    expect(followLookNothingBetter({ askedAt: 3000, search: search(miss.finish, 2000), miss })).toBe(false);
    expect(followLookNothingBetter({ askedAt: null, search: search(miss.finish, 2000), miss })).toBe(false);
    expect(followLookNothingBetter({ askedAt: 1000, search: null, miss })).toBe(false);
    expect(followLookNothingBetter({ askedAt: 1000, search: search(miss.finish, 2000), miss: null })).toBe(false);
  });
});

describe('followLook: what the card remembers while the player runs the search on the goal screen', () => {
  it('keeps when it was asked, per goal, for this visit', () => {
    followLook.reset();
    expect(followLook.askedAt('date 1')).toBeNull();
    followLook.ask('date 1', 5000);
    expect(followLook.askedAt('date 1')).toBe(5000);
    expect(followLook.askedAt('date 2')).toBeNull();
    followLook.reset();
    expect(followLook.askedAt('date 1')).toBeNull();
  });
});

describe('followNoBetterLine (DRAFT words, Words writes the final text)', () => {
  const at = (u: number) => `<${u}>`;
  const miss = { finish: DEADLINE + 50 * H, deadline: DEADLINE, lateSeconds: 50 * H };
  it('Egg Day, and a chosen date', () => {
    expect(followNoBetterLine(miss, at, true, 'just now')).toBe(`Checked just now: your route is still the fastest. It finishes <${miss.finish}>, 2d 2h after Egg Day starts.`);
    expect(followNoBetterLine(miss, at, false, 'just now')).toBe(`Checked just now: your route is still the fastest. It finishes <${miss.finish}>, 2d 2h after your date.`);
  });
});

// ----------------------------------------------------------------------------- no route makes the date (17 Nov 2026)
describe('followCannotOf: on the newest save no route gets above the TE by the date', () => {
  const base = { goal: 'date' as const, deadline: DEADLINE, checkedHere: true, planInTime: false, lateKept: false, pricedOnOlderSave: true };
  it('a followed date goal, priced on an older save, whose date was worked out on this save with no route in time and none late: yes', () => {
    expect(followCannotOf(base)).toBe(true);
  });
  it('not when a plan in time or a late one is kept for this save (the miss line says it, with its finish)', () => {
    expect(followCannotOf({ ...base, planInTime: true })).toBe(false);
    expect(followCannotOf({ ...base, lateKept: true })).toBe(false);
  });
  it('not when the date has not been worked out on this save (nothing to say yet), or the route is priced on this save', () => {
    expect(followCannotOf({ ...base, checkedHere: false })).toBe(false);
    expect(followCannotOf({ ...base, pricedOnOlderSave: false })).toBe(false);
  });
  it('not for Fastest, and not without a date', () => {
    expect(followCannotOf({ ...base, goal: 'fastest' })).toBe(false);
    expect(followCannotOf({ ...base, deadline: null })).toBe(false);
  });
});

describe('the best for the date is below the followed TE (Words, 17 Nov 2026)', () => {
  it('says the best and the followed TE, or Egg Day', () => {
    expect(FOLLOW_BELOW_LINE('Nov 9', 198, 199, false)).toBe('On your newest save, the best by Nov 9 is 198 TE, below the 199 TE you follow.');
    expect(FOLLOW_BELOW_LINE('Nov 9', 198.6, 199.2, true)).toBe('On your newest save, the best by Egg Day is 198 TE, below the 199 TE you follow.');
  });
  it('each is under 170 characters, with no banned phrase', () => {
    for (const s of [FOLLOW_BELOW_LINE('Nov 9, 2026', 198, 199, false), FOLLOW_BELOW_BUTTON, FOLLOW_BELOW_NOTE]) {
      expect(s.length).toBeLessThan(170);
      expect(s).not.toMatch(/this device|this computer|^Your plan|[io]n your plan/i);
    }
  });
});

// ----------------------------------------------------------------------------- the best on the newest save is below the TE followed
describe('followBelowOf: this save\'s own answer for the date tops out below the TE you follow (QA, 17 Nov 2026: 198 against 199)', () => {
  const base = { goal: 'date' as const, deadline: DEADLINE, pricedOnOlderSave: true, followedTE: 199, bestHere: { endTE: 198 } };
  it('a followed date goal priced on an older save, with this save\'s best below it: the two numbers', () => {
    expect(followBelowOf(base)).toEqual({ bestTE: 198, followedTE: 199 });
  });
  it('not when this save\'s best equals or beats the followed TE', () => {
    expect(followBelowOf({ ...base, bestHere: { endTE: 199 } })).toBeNull();
    expect(followBelowOf({ ...base, bestHere: { endTE: 204 } })).toBeNull();
  });
  it('not without this save\'s best, or when the route is priced on this save (the miss line speaks then)', () => {
    expect(followBelowOf({ ...base, bestHere: null })).toBeNull();
    expect(followBelowOf({ ...base, pricedOnOlderSave: false })).toBeNull();
  });
  it('not for Fastest, without a date, or without numbers', () => {
    expect(followBelowOf({ ...base, goal: 'fastest' })).toBeNull();
    expect(followBelowOf({ ...base, deadline: null })).toBeNull();
    expect(followBelowOf({ ...base, followedTE: NaN })).toBeNull();
  });
});

describe('workedOutHereAt: an older save\'s plan must not look worked out on the loaded save (17 Nov 2026)', () => {
  const SAVE = 1_800_000_000;
  const cand = (backupTime: number, at: number, ownKey = false) => ({ goalKey: 'date-1', ownKey, plan: { calculatedAt: at, meta: { backupTime } } });
  it('an older save\'s plan alone: 0', () => {
    expect(workedOutHereAt({ goalKey: 'date-1', loadedSave: SAVE, candidates: [cand(SAVE - 3 * 86400, 5000)], answers: [] })).toBe(0);
  });
  it('a plan priced on the loaded save, or an answer kept for it: its time', () => {
    expect(workedOutHereAt({ goalKey: 'date-1', loadedSave: SAVE, candidates: [cand(SAVE - 3 * 86400, 5000), cand(SAVE, 7000)], answers: [] })).toBe(7000);
    expect(workedOutHereAt({ goalKey: 'date-1', loadedSave: SAVE, candidates: [], answers: [{ goalKey: 'date-1', calculatedAt: 9000, saveSeconds: SAVE, ownKey: true }] })).toBe(9000);
  });
  it('another goal\'s plans do not count', () => {
    expect(workedOutHereAt({ goalKey: 'date-2', loadedSave: SAVE, candidates: [cand(SAVE, 7000)], answers: [] })).toBe(0);
  });
});

describe('QA\'s 3d78e4e5f findings (17 Nov 2026)', () => {
  const SAVE = 1_800_000_000;
  it('an answer kept from an OLDER save does not count as worked out here, whatever its snapshot key says (the false "no route can make it")', () => {
    expect(workedOutHereAt({ goalKey: 'g', loadedSave: SAVE, candidates: [], answers: [{ goalKey: 'g', calculatedAt: 9000, saveSeconds: SAVE - 1800, ownKey: true }] })).toBe(0);
    // (a save up to 2 h older counts as current for ranking, lib/currentAnswer.ts CURRENT_SAVE_SECONDS; here it must not)
    expect(workedOutHereAt({ goalKey: 'g', loadedSave: SAVE, candidates: [{ goalKey: 'g', ownKey: true, plan: { calculatedAt: 8000, meta: { backupTime: SAVE - 3000 } } }], answers: [] })).toBe(0);
    expect(workedOutHereAt({ goalKey: 'g', loadedSave: SAVE, candidates: [], answers: [{ goalKey: 'g', calculatedAt: 9000, saveSeconds: SAVE, ownKey: true }] })).toBe(9000);
  });
  it('the flags: "best below the TE you follow" ON (seen live), "no route can make the date" OFF (not reachable with the fixtures, so unseen)', () => {
    expect(FOLLOW_BELOW_ON).toBe(true);
    expect(FOLLOW_CANNOT_ON).toBe(false);
  });
});

describe('plansOfThisSave: the plans priced ON the loaded save, read from the candidates, not from the pick (Reliability\'s fix, live run 17 Nov 2026)', () => {
  const SAVE = 1_800_000_000;
  const D = 1_900_000_000;
  const plan = (te: number, bt: number, end: number) => ({ goal: 'date' as const, deadline: D, end, endTE: te, meta: { backupTime: bt } });
  const c = (p: ReturnType<typeof plan>) => ({ goalKey: 'g', plan: p });
  it('the pick can be an older save\'s 199 (a save 30 min older ranks as current) while this save has a 198 in time: the 198 is read', () => {
    const r = plansOfThisSave({ goalKey: 'g', loadedSave: SAVE, candidates: [c(plan(199, SAVE - 1800, D - 100)), c(plan(198, SAVE, D - 3600))] });
    expect(r).toEqual({ count: 2 - 1, bestInTime: { endTE: 198 } });
  });
  it('plans of this save that all land after the date: counted, none in time', () => {
    expect(plansOfThisSave({ goalKey: 'g', loadedSave: SAVE, candidates: [c(plan(198, SAVE, D + 3600))] })).toEqual({ count: 1, bestInTime: null });
  });
  it('only an older save\'s plans: nothing of this save', () => {
    expect(plansOfThisSave({ goalKey: 'g', loadedSave: SAVE, candidates: [c(plan(199, SAVE - 1800, D - 100))] })).toEqual({ count: 0, bestInTime: null });
  });
  it('the best of several in time is the highest TE; another goal\'s plans do not count', () => {
    const r = plansOfThisSave({ goalKey: 'g', loadedSave: SAVE, candidates: [c(plan(198, SAVE, D - 100)), c(plan(204, SAVE, D - 200)), { goalKey: 'other', plan: plan(300, SAVE, D - 1) }] });
    expect(r).toEqual({ count: 2, bestInTime: { endTE: 204 } });
  });
});
