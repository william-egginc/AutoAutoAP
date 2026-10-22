import { describe, expect, it } from 'vitest';
import { DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, RANGE_LOW, followedCount, rangeFromCount, rangeNow } from './ascRange';
import { choosePreferFewer, PREFER_OFF, type PreferRow } from '@/search/preferFewer';

// The default ascension range on Fastest and By a date: 3 to one more than the instant answer's count, the count
// the box leads with under "Prefer fewer ascensions" (Jordan, 22 Oct 2026).
const FASTEST = { floor: 2, ceil: 12 };
const DAY = 86400;
const free = { min: null, max: null };

const fast = (ascensions: number, finishDay: number): PreferRow<string> => ({
  item: `${ascensions}`,
  ascensions,
  finish: finishDay * DAY,
  shifts: null,
});
const date = (ascensions: number, endTE: number, spareH = 10): PreferRow<string> => ({
  item: `${ascensions}`,
  ascensions,
  finish: 0,
  endTE,
  spare: spareH * 3600,
  shifts: null,
});

describe('followedCount: the count the range follows', () => {
  // Fastest: 6 ascensions is the fastest; 5 finishes 20 h later, 4 finishes 2 days later.
  const best = fast(6, 100);
  const rows = [best, fast(5, 100 + 20 / 24), fast(4, 102)];
  it('Prefer fewer Off: the best count', () => {
    expect(followedCount(choosePreferFewer('fastest', rows, PREFER_OFF, best))).toBe(6);
  });
  it('within 1 day: the chosen route’s count, not the fastest', () => {
    expect(followedCount(choosePreferFewer('fastest', rows, { kind: 'time', seconds: DAY }, best))).toBe(5);
  });
  it('within 2 days: fewer still', () => {
    expect(followedCount(choosePreferFewer('fastest', rows, { kind: 'time', seconds: 2 * DAY }, best))).toBe(4);
  });
  it('within 12 h, nothing fewer is close enough: the best', () => {
    expect(followedCount(choosePreferFewer('fastest', rows, { kind: 'time', seconds: DAY / 2 }, best))).toBe(6);
  });

  // By a date: 5 ascensions reach TE 314; 4 reach 314 too, 3 reach 313.
  const top = date(5, 314);
  const dates = [top, date(4, 314), date(3, 313)];
  it('By a date, same TE: the fewest that reach the best TE', () => {
    expect(followedCount(choosePreferFewer('date', dates, { kind: 'te', te: 0 }, top))).toBe(4);
  });
  it('By a date, within 1 TE: fewer again', () => {
    expect(followedCount(choosePreferFewer('date', dates, { kind: 'te', te: 1 }, top))).toBe(3);
  });
  it('By a date, Off: the best', () => {
    expect(followedCount(choosePreferFewer('date', dates, PREFER_OFF, top))).toBe(5);
  });
  it('no instant answer: null', () => {
    expect(followedCount(null)).toBeNull();
    expect(followedCount(undefined)).toBeNull();
    expect(followedCount(choosePreferFewer('fastest', [], PREFER_OFF))).toBeNull();
  });
});

describe('rangeFromCount: 3 to the count + 1', () => {
  it('the low end is 3', () => {
    expect(RANGE_LOW).toBe(3);
    expect(rangeFromCount(4, FASTEST)).toEqual({ min: 3, max: 5 });
    expect(rangeFromCount(7, FASTEST)).toEqual({ min: 3, max: 8 });
    expect(rangeFromCount(3, DATE_RANGE_BOUNDS)).toEqual({ min: 3, max: 4 });
  });
  it('count + 1 below 3: the range starts at the count, so it holds it', () => {
    expect(rangeFromCount(2, DATE_RANGE_BOUNDS)).toEqual({ min: 2, max: 3 });
    expect(rangeFromCount(1, DATE_RANGE_BOUNDS)).toEqual({ min: 1, max: 2 });
    // Fastest's box starts at 2.
    expect(rangeFromCount(1, FASTEST)).toEqual({ min: 2, max: 2 });
  });
  it('held to the box’s top', () => {
    expect(rangeFromCount(12, FASTEST)).toEqual({ min: 3, max: 12 });
    expect(rangeFromCount(12, DATE_RANGE_BOUNDS)).toEqual({ min: 3, max: 12 });
    expect(rangeFromCount(5.7, DATE_RANGE_BOUNDS)).toEqual({ min: 3, max: 6 });
  });
  it('no instant answer: null', () => {
    for (const c of [null, undefined, 0, -1, Number.NaN, Infinity]) expect(rangeFromCount(c, FASTEST)).toBeNull();
  });
});

describe('rangeNow: the player’s ends win', () => {
  it('nothing set: the instant answer’s range, else the old default', () => {
    expect(rangeNow(6, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, free)).toEqual({ min: 3, max: 7 });
    expect(rangeNow(null, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, free)).toEqual({ min: 1, max: 5 });
    expect(DATE_RANGE_FALLBACK).toEqual({ min: 1, max: 5 });
  });
  it('an end the player set stays, whatever the instant answer says; the other follows', () => {
    expect(rangeNow(6, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: 2, max: null })).toEqual({ min: 2, max: 7 });
    expect(rangeNow(9, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: 2, max: null })).toEqual({ min: 2, max: 10 });
    expect(rangeNow(6, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: 4, max: 9 })).toEqual({ min: 4, max: 9 });
    expect(rangeNow(null, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: null, max: 8 })).toEqual({ min: 1, max: 8 });
  });
  it('a followed end never crosses a set one', () => {
    expect(rangeNow(4, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: 8, max: null })).toEqual({ min: 8, max: 8 });
    expect(rangeNow(4, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: null, max: 2 })).toEqual({ min: 2, max: 2 });
  });
});
