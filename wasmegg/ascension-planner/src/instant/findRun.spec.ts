import { describe, expect, it } from 'vitest';
import type { AnswerRow } from './instantAnswer';
import type { RouteLeg } from './routeFinder';
import {
  agoText,
  ascensionTimes,
  atText,
  behindText,
  countsText,
  finishOf,
  gearLabel,
  cellText,
  inText,
  rowsByBest,
  whenAgo,
} from './findRun';

const D = 86400;
const T = Date.parse('2026-10-19T14:30:00Z') / 1000; // Mon Oct 19, 7:30 am Pacific
const leg = (from: number, to: number, start: number, end: number): RouteLeg => ({
  from,
  to,
  endTE: to,
  start,
  end,
  sales: 2,
  tier13: false,
  label: '2-sale',
});
function row(k: number, chain: number[], end: number, endTE = chain[chain.length - 1], best = false): AnswerRow {
  let at = T;
  const step = (end - T) / chain.length;
  const legs = chain.map((to, i) => leg(i ? chain[i - 1] : 160, to, at, (at += step)));
  return { ascensions: k, route: { chain, legs, end, seconds: end - T }, endTE, best };
}

describe('find a run: estimate starts and ends', () => {
  it('are each ascension’s own leg times from the route finder', () => {
    const r = row(3, [166, 197, 223], T + 9 * D);
    expect(ascensionTimes(r.route)).toEqual([
      { n: 1, to: 166, start: T, end: T + 3 * D },
      { n: 2, to: 197, start: T + 3 * D, end: T + 6 * D },
      { n: 3, to: 223, start: T + 6 * D, end: T + 9 * D },
    ]);
  });

  it('a leg missing its start starts when the one before ended', () => {
    const r = row(2, [166, 197], T + 4 * D);
    r.route.legs[1] = { ...r.route.legs[1], start: NaN };
    expect(ascensionTimes(r.route)[1]).toEqual({ n: 2, to: 197, start: T + 2 * D, end: T + 4 * D });
  });
});

describe('find a run: behind the best', () => {
  it('race: the soonest is the best; others in days (hours under a day)', () => {
    const rows = [
      row(6, [166, 203, 231, 300, 400, 490], T + 108 * D),
      row(7, [166, 197, 223, 251, 300, 400, 490], T + 100 * D, 490, true),
      row(8, [164, 198, 220, 250, 300, 350, 420, 490], T + 100 * D + 5 * 3600),
      row(5, [167, 205, 300, 400, 490], T + 120.4 * D),
    ];
    const sorted = rowsByBest(rows, false);
    expect(sorted.map(r => r.ascensions)).toEqual([7, 8, 6, 5]);
    expect(sorted.map(r => behindText(r, rows, false))).toEqual(['the best', '5 hours behind', '8 days behind', '20 days behind']);
    expect(behindText(row(9, [490], T + 101 * D), rows, false)).toBe('1 day behind');
    expect(countsText(rows)).toBe('5 to 8');
    expect(countsText([rows[0]])).toBe('6');
    expect(finishOf(rows[1], false)).toBe(T + 100 * D);
  });

  it('by a date: the highest TE is the best; others in TE', () => {
    const rows = [
      row(4, [161, 198, 218, 248], T + 200 * D, 248, true),
      row(6, [160, 188, 195, 197, 218, 247], T + 190 * D, 247),
      row(3, [170, 210, 240], T + 180 * D, 240),
      row(5, [170, 200, 220, 230, 248], T + 210 * D, 248),
    ];
    const sorted = rowsByBest(rows, true);
    expect(sorted.map(r => r.ascensions)).toEqual([4, 5, 6, 3]);
    expect(sorted.map(r => behindText(r, rows, true))).toEqual(['the best', 'same TE', '1 TE behind', '8 TE behind']);
    // The last ascension's end.
    expect(finishOf(rows[0], true)).toBe(T + 200 * D);
  });
});

describe('find a run: words', () => {
  it('12-hour times with am/pm, in the planner’s timezone', () => {
    const tz = 'America/Los_Angeles';
    expect(atText(T, tz)).toBe('Oct 19 at 7:30 am');
    expect(atText(T, tz, { weekday: true })).toBe('Mon, Oct 19 at 7:30 am');
    expect(atText(T + 6 * 3600 - 30 * 60 + 14 * 60, tz, { year: true })).toBe('Oct 19, 2026 at 1:14 pm');
    expect(atText(T, 'America/New_York')).toBe('Oct 19 at 10:30 am');
  });

  it('a Starts / Ends cell gives the year only when it is not this year’s', () => {
    const tz = 'America/Los_Angeles';
    expect(cellText(T, tz, T)).toBe('Mon, Oct 19 at 7:30 am');
    expect(cellText(T + 140 * D, tz, T)).toBe('Mon, Mar 8, 2027 at 6:30 am');
  });

  it('ago and in', () => {
    expect(agoText(T - 2 * 3600, T)).toBe('2 hours ago');
    expect(agoText(T - 9 * D, T)).toBe('9 days ago');
    expect(agoText(T - 60, T)).toBe('1 minute ago');
    expect(agoText(T - 5, T)).toBe('just now');
    expect(inText(T + 4 * D, T)).toBe('in 4 days');
    expect(whenAgo(T - 2 * 3600, T, 'America/Los_Angeles')).toBe('Oct 19 at 5:30 am (2 hours ago)');
  });

  it('gear: maxed, or the save’s gear as the card says it', () => {
    expect(gearLabel(null)).toBe('maxed gear');
    expect(gearLabel({ bonusShort: 0, scale: 1 })).toBe('maxed gear');
    expect(gearLabel({ bonusShort: 0.4, scale: 0.936 })).toBe(
      'your gear (delivery 93.6% of maxed, earnings set 0.40 Clothed TE short)'
    );
  });
});
