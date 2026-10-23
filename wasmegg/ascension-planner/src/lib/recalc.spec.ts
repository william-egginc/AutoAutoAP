import { describe, expect, it } from 'vitest';
import { askGoal, fastOpen, needsFreshSave, recalcButton, recalcWords } from './recalc';
import { instantGoal } from '@/search/instantSnapshot';

const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000;
const H = 3600;

describe('Run Fast (was Recalculate, which ran Check exactly until 23 Oct 2026)', () => {
  it("the goal's words are the instant answer's own", () => {
    expect(askGoal({ goal: 'fastest', target: 490, deadline: null })).toBe(instantGoal(null, 490));
    expect(askGoal({ goal: 'date', target: 313, deadline: 1815753600 })).toBe(instantGoal(1815753600, 313));
  });

  it('the line beside the button says what it does; the button says "again" once a Fast run drives', () => {
    expect(recalcWords({ auto: 'fastest', depth: 'smart', target: 490 })).toBe(
      'Opens Fastest to 490 TE with your save and Fast selected; it starts when you press Find'
    );
    expect(recalcWords({ auto: 'by-date', byDate: { eggDay: true } })).toBe(
      'Opens Highest TE by a date with your save and Fast selected; it starts when you press Find'
    );
    expect(recalcButton(false)).toBe('Run Fast');
    expect(recalcButton(true)).toBe('Run Fast again');
  });

  it('opens the screen with the panel on Fast (Nearby routes, quick)', () => {
    expect(fastOpen({ auto: 'fastest', depth: 'smart', target: 490 })).toEqual({
      auto: 'fastest',
      depth: 'smart',
      target: 490,
      tab: 'nearby',
      level: 'quick',
    });
    expect(fastOpen({ auto: 'by-date', byDate: { eggDay: true } })).toEqual({
      auto: 'by-date',
      byDate: { eggDay: true },
      tab: 'nearby',
      level: 'quick',
    });
  });

  it('a save 6 hours old or more is loaded fresh first', () => {
    expect(needsFreshSave(NOW - 5.9 * H, NOW)).toBe(false);
    expect(needsFreshSave(NOW - 6 * H, NOW)).toBe(true);
    expect(needsFreshSave(null, NOW)).toBe(true);
  });
});
