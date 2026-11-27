/**
 * TWO ROUTES (R10 option C, 21 Nov 2026, Jordan "go with your picks", option 1(a)): when the exact check finds the pick without the held
 * buys really ends sooner, the box switches to it by itself and offers "Show the first route instead"; never by itself after Follow or
 * Simulate was pressed on that box (the player acted on the first route). This is the rule, with no component around it.
 */
import { describe, expect, it } from 'vitest';
import { exactRouteFor, isSwapped, pressedChoice, type ExactDoneLike, preferKeepsFirst } from './exactTwoRoute';

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

describe('preferKeepsFirst (code review 22 Nov 2026, math-exact-6): Fastest, Prefer fewer’s margin holds against the automatic switch', () => {
  const H = 3600;
  const margin = { kind: 'time', seconds: 12 * H } as const;
  const own = { ascensions: 3, end: 100 * H };
  it('3 against 4 ascensions, margin 12 h: the 4-ascension route 2 h sooner does not take the box', () => {
    expect(preferKeepsFirst({ margin, showBest: false, own, alt: { ascensions: 4, end: 98 * H } })).toBe(true);
  });
  it('13 h sooner (past the margin): it does', () => {
    expect(preferKeepsFirst({ margin, showBest: false, own, alt: { ascensions: 4, end: 87 * H } })).toBe(false);
  });
  it('Prefer fewer off, "show the fastest" on, or the other route no longer: the switch as before', () => {
    const alt = { ascensions: 4, end: 98 * H };
    expect(preferKeepsFirst({ margin: { kind: 'off' }, showBest: false, own, alt })).toBe(false);
    expect(preferKeepsFirst({ margin, showBest: true, own, alt })).toBe(false);
    expect(preferKeepsFirst({ margin, showBest: false, own, alt: { ascensions: 3, end: 98 * H } })).toBe(false);
  });
});
