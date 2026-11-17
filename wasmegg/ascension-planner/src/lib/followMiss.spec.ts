/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov "no better-route offer
 * on My runs"): a By a date goal is followed and the finish worked out again from the newest save is later than the
 * goal's date. Pure rule; the card shows it (RightNowCard.followMisses.spec.ts).
 */
import { describe, expect, it } from 'vitest';
import { followBelowOf, followCannotOf, followMissOf, workedOutHereAt } from './followMiss';
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
