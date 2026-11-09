/** The soul-egg warning in two parts (9 Nov 2026): one line and a fold, pinned word for word. */
import { describe, expect, it } from 'vitest';
import { soulEggFold, soulEggLine, soulEggPercentWords } from './soulEggWords';
import { QUARTER_SHIFTS, SE_WARN_BELOW, soulEggWarningParts } from './soulEggs';
import { isWordingOnly } from './resultCodeHash';

describe('soul egg words', () => {
  it('the line and the fold, with a save', () => {
    expect(soulEggLine('under 1%', false)).toBe('This plan would leave under 1% of your soul eggs.');
    expect(soulEggFold({ plan: 53, done: 212, percent: 'under 1%', quarterShifts: 168 })).toBe(
      'About 265 shifts since your last Path reset (212 in your save, 53 in the plan) would leave under 1% of the soul eggs you have now. Past about 168 shifts since a Path reset, less than a quarter is left.'
    );
  });
  it('without the save: the plan alone, counted from 0', () => {
    expect(soulEggLine('about 12%', true)).toBe('This plan alone would leave about 12% of your soul eggs.');
    expect(soulEggFold({ plan: 41, done: null, percent: 'about 12%', quarterShifts: 168 })).toBe(
      "This plan has 41 shifts, counted from 0 shifts: your save's shifts since your last Path reset aren't known here. Past about 168 shifts since a Path reset, less than a quarter is left."
    );
    expect(soulEggFold({ plan: 1, done: null, percent: 'about 12%', quarterShifts: 168 })).toContain('This plan has 1 shift,');
  });
  it('percent: rounded down, under 1% below one percent', () => {
    expect(soulEggPercentWords(0.004)).toBe('under 1%');
    expect(soulEggPercentWords(0.249)).toBe('about 24%');
  });
  it('shows only under a quarter (the old one-line warning\'s rule, at QUARTER_SHIFTS from 0)', () => {
    for (const [planShifts, done, shown] of [[53, 212, true], [10, 0, false], [41, null, false], [200, 0, true], [null, 5, false]] as const) {
      expect(soulEggWarningParts({ planShifts, done }) !== null, `${planShifts} ${done}`).toBe(shown);
    }
    expect(soulEggWarningParts({ planShifts: 53, done: 212 })?.line).toBe('This plan would leave under 1% of your soul eggs.');
    expect(SE_WARN_BELOW).toBe(0.25);
    expect(QUARTER_SHIFTS).toBe(168);
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/soulEggWords.ts')).toBe(true);
  });
});
