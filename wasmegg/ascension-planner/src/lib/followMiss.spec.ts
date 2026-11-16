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
