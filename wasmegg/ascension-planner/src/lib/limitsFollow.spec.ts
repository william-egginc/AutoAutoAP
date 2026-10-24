import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  boxCountFromBest,
  carryOnLimitsNote,
  followLimits,
  followingFields,
  limitsFromBest,
  limitsHint,
} from './limitsFollow';

const none = { min: false, max: false };

describe('limitsFromBest: 3 to one more than the instant answer (lib/ascRange.ts), inside the box 2..12', () => {
  it('Allan: best 4 gives 3 to 5, so Fast looks at 4', () => {
    expect(limitsFromBest(4)).toEqual({ min: 3, max: 5 });
  });
  it('a middling count', () => {
    expect(limitsFromBest(7)).toEqual({ min: 3, max: 8 });
  });
  it('below 3 it starts at the count; clamps at the floor (the input min is 2) and the ceiling (12)', () => {
    expect(limitsFromBest(2)).toEqual({ min: 2, max: 3 });
    expect(limitsFromBest(1)).toEqual({ min: 2, max: 2 });
    expect(limitsFromBest(11)).toEqual({ min: 3, max: 12 });
    expect(limitsFromBest(12)).toEqual({ min: 3, max: 12 });
    expect(limitsFromBest(15)).toEqual({ min: 3, max: 12 });
  });
  it('no instant answer: null (the old 5 to 8 stay)', () => {
    expect(limitsFromBest(null)).toBeNull();
    expect(limitsFromBest(undefined)).toBeNull();
    expect(limitsFromBest(0)).toBeNull();
    expect(limitsFromBest(Number.NaN)).toBeNull();
    expect(DEFAULT_LIMITS).toEqual({ min: 5, max: 8 });
  });
});

describe('followLimits', () => {
  it('untouched fields follow, and follow again when the best changes', () => {
    let l = followLimits(DEFAULT_LIMITS, 4, none, true);
    expect(l).toEqual({ min: 3, max: 5 });
    l = followLimits(l, 9, none, true);
    expect(l).toEqual({ min: 3, max: 10 });
  });
  it('a field the player set stays; the other keeps following', () => {
    expect(followLimits({ min: 4, max: 8 }, 9, { min: true, max: false }, true)).toEqual({ min: 4, max: 10 });
    expect(followLimits({ min: 5, max: 10 }, 4, { min: false, max: true }, true)).toEqual({ min: 3, max: 10 });
    expect(followLimits({ min: 3, max: 10 }, 7, { min: true, max: true }, true)).toEqual({ min: 3, max: 10 });
  });
  it('a follower never crosses a set field', () => {
    // Min set to 9, best 4 asks for at most 5: most is held to 9.
    expect(followLimits({ min: 9, max: 10 }, 4, { min: true, max: false }, true)).toEqual({ min: 9, max: 9 });
    // Most set to 2, best 9 asks for at least 3: fewest is held to 2.
    expect(followLimits({ min: 2, max: 2 }, 9, { min: false, max: true }, true)).toEqual({ min: 2, max: 2 });
  });
  it('nothing moves while a search runs or is being carried on, or without an answer', () => {
    expect(followLimits({ min: 5, max: 8 }, 4, none, false)).toEqual({ min: 5, max: 8 });
    expect(followLimits({ min: 5, max: 8 }, null, none, true)).toEqual({ min: 5, max: 8 });
  });
});

describe('the grey hint', () => {
  it('names which limits follow the instant answer', () => {
    expect(limitsHint(followingFields({ min: 3, max: 5 }, 4, none))).toBe('(from the instant answer)');
    expect(limitsHint(followingFields({ min: 4, max: 5 }, 4, { min: true, max: false }))).toBe(
      '(most from the instant answer)'
    );
    expect(limitsHint(followingFields({ min: 3, max: 9 }, 4, { min: false, max: true }))).toBe(
      '(fewest from the instant answer)'
    );
    expect(limitsHint(followingFields({ min: 3, max: 5 }, 4, { min: true, max: true }))).toBe('');
  });
  it('none before an instant answer, or while the box still reads otherwise (a run going)', () => {
    expect(limitsHint(followingFields({ min: 5, max: 8 }, null, none))).toBe('');
    expect(limitsHint(followingFields({ min: 5, max: 8 }, 4, none))).toBe('');
  });
});

describe('boxCountFromBest (By a date Exhaustive box 1)', () => {
  it('the best route count, held to 1..8', () => {
    expect(boxCountFromBest(6)).toBe(6);
    expect(boxCountFromBest(1)).toBe(1);
    expect(boxCountFromBest(11)).toBe(8);
    expect(boxCountFromBest(11, 12)).toBe(11);
    expect(boxCountFromBest(null)).toBeNull();
    expect(boxCountFromBest(0)).toBeNull();
  });
});

describe('carryOnLimitsNote', () => {
  it('only when the run’s own limits differ from the box', () => {
    expect(carryOnLimitsNote(null, { min: 2, max: 6 })).toBe('');
    expect(carryOnLimitsNote({ min: 2, max: 6 }, { min: 2, max: 6 })).toBe('');
    expect(carryOnLimitsNote({ min: 5, max: 8 }, { min: 2, max: 6 })).toBe(
      'It searches under its own limits, 5 to 8 ascensions, as it started (the Limits box reads 2 to 6 now).'
    );
  });
});
