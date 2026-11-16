/**
 * THE FOLLOWED ROUTE THAT NOW MISSES ITS DATE (Jordan, 16 Nov 2026; his exception to the 13 Nov "no better-route offer
 * on My runs"): a By a date goal is followed and the finish worked out again from the newest save is later than the
 * goal's date. Pure rule; the card shows it (RightNowCard.followMisses.spec.ts).
 */
import { describe, expect, it } from 'vitest';
import { followMissOf } from './followMiss';

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
