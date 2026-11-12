/**
 * M13 item 3 (12 Nov 2026): the Egg Day row's spare is the instant answer's plan; the followed route (an older planner's pick)
 * can land later, after the date. Its own line says so, from the follow state's `late` (missesDate), beside the row.
 */
import { describe, expect, it } from 'vitest';
import { followedLateLine } from './followedLateWords';
import type { GoalFollow } from './planGoals';

const JUL11 = Date.parse('2027-07-12T00:00:00Z') / 1000;
const JUL17 = Date.parse('2027-07-17T10:00:00Z') / 1000;
const day = (t: number) => `D${Math.round((t - JUL11) / 3600)}`;
const f = (o: Partial<GoalFollow> = {}): GoalFollow => ({ times: 'estimate', end: JUL17, late: true, ...o });

describe('followedLateLine', () => {
  it('a followed route that lands after the date, the plan shown earlier: its own line', () => {
    expect(followedLateLine(f(), JUL11, day, 'after Egg Day starts')).toBe(
      `Your followed route lands about ${day(JUL17)}, after Egg Day starts`
    );
  });
  it('a finish kept from a check says "lands", not "about"', () => {
    expect(followedLateLine(f({ times: 'finish' }), JUL11, day, 'after your date')).toBe(`Your followed route lands ${day(JUL17)}, after your date`);
  });
  it('not late, or no time: nothing', () => {
    expect(followedLateLine(f({ late: false }), JUL11, day, 'x')).toBe('');
    expect(followedLateLine(f({ end: null }), JUL11, day, 'x')).toBe('');
    expect(followedLateLine(f({ times: 'working' }), JUL11, day, 'x')).toBe('');
    expect(followedLateLine(undefined, JUL11, day, 'x')).toBe('');
  });
  it('the plan shown IS the followed route (same finish): the row already says it, no second line', () => {
    expect(followedLateLine(f(), JUL17 + 600, day, 'x')).toBe('');
  });
});
