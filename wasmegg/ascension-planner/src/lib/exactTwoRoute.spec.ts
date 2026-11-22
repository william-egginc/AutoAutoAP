/**
 * TWO ROUTES (R10 option C, 21 Nov 2026, Jordan "go with your picks", option 1(a)): when the exact check finds the pick without the held
 * buys really ends sooner, the box switches to it by itself and offers "Show the first route instead"; never by itself after Follow or
 * Simulate was pressed on that box (the player acted on the first route). This is the rule, with no component around it.
 */
import { describe, expect, it } from 'vitest';
import { exactRouteFor, isSwapped, pressedChoice, type ExactDoneLike } from './exactTwoRoute';

const r = (chain: number[], end: number, spare: number | null = null) => ({ chain, end, legs: [end], spare });
const done = (faster: 0 | 1): ExactDoneLike => ({
  routes: [r([100, 200], 1000, -5), r([120, 200], 600, 400)],
  faster,
  end: 1000,
  legs: [1000],
  spare: -5,
});

describe('isSwapped', () => {
  it('by itself only when the other route is faster and nothing was pressed', () => {
    expect(isSwapped({ faster: 1, choice: 'auto', pressed: false })).toBe(true);
    expect(isSwapped({ faster: 0, choice: 'auto', pressed: false })).toBe(false);
  });
  it('never by itself after Follow or Simulate was pressed on the box', () => {
    expect(isSwapped({ faster: 1, choice: 'auto', pressed: true })).toBe(false);
  });
  it('the player\'s own pick wins over the automatic one, both ways', () => {
    expect(isSwapped({ faster: 1, choice: 'first', pressed: false })).toBe(false);
    expect(isSwapped({ faster: 1, choice: 'faster', pressed: true })).toBe(true);
    expect(isSwapped({ faster: 0, choice: 'faster', pressed: false })).toBe(true);
  });
  it('nothing swaps without an exact result (faster unknown)', () => {
    expect(isSwapped({ faster: null, choice: 'auto', pressed: false })).toBe(false);
  });
});

describe('pressedChoice: pressing freezes the box as it is', () => {
  it('a swapped box stays swapped and a first-route box stays first', () => {
    expect(pressedChoice(true)).toBe('faster');
    expect(pressedChoice(false)).toBe('first');
  });
});

describe('exactRouteFor: the exact numbers of the route on screen', () => {
  it('the route in the box by its stops, not by position', () => {
    expect(exactRouteFor(done(1), [120, 200])?.end).toBe(600);
    expect(exactRouteFor(done(1), [100, 200])?.end).toBe(1000);
  });
  it('a chain the check did not work out: null (the box shows its own estimate)', () => {
    expect(exactRouteFor(done(1), [1, 2])).toBeNull();
    expect(exactRouteFor(null, [100, 200])).toBeNull();
  });
});
