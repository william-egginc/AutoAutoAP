/** Soul eggs a plan's shifts would leave, and the amber line under a quarter (the math review's second check, 24 Oct
 *  2026, finding 15). */
import { describe, expect, it } from 'vitest';
import * as soulEggs from './soulEggs';
import { NOMINAL_SOUL_EGGS, QUARTER_SHIFTS, SE_WARN_BELOW, soulEggWarningParts, soulEggsLeft } from './soulEggs';

describe('soul eggs left after N shifts from a Path reset', () => {
  it("the review's points: 97% at 60, 69% at 120, 24% at 168, 6% at 200, 0.2% at 240", () => {
    // Within a point of the review's rounded figures, at the nominal soul eggs and across 1e15 to 1e24.
    const points: [number, number][] = [
      [60, 0.97],
      [120, 0.69],
      [168, 0.24],
      [200, 0.06],
      [240, 0.002],
    ];
    for (const se of [1e15, 1e18, NOMINAL_SOUL_EGGS, 1e24])
      for (const [n, left] of points) expect(Math.abs(soulEggsLeft(0, n, se) - left), `${n} at ${se}`).toBeLessThan(0.015);
    expect(soulEggsLeft(0, 0)).toBe(1);
  });

  it('counts the shifts already made: the plan picks up where the save is', () => {
    // 60 done then 108 more spends the same soul eggs as 168 from 0, out of what the 60 left.
    const from0 = soulEggsLeft(0, 168);
    const after60 = soulEggsLeft(0, 60);
    expect(soulEggsLeft(60, 108)).toBeCloseTo(from0 / after60, 3);
  });

  it('a quarter is crossed at about 168 shifts', () => {
    expect(soulEggsLeft(0, QUARTER_SHIFTS - 1)).toBeGreaterThanOrEqual(SE_WARN_BELOW);
    expect(soulEggsLeft(0, QUARTER_SHIFTS)).toBeLessThan(SE_WARN_BELOW);
  });

  it('never below 0', () => {
    expect(soulEggsLeft(0, 400)).toBeGreaterThanOrEqual(0);
  });
});

describe('the line and its "?" (soulEggWarningParts; was one long line, soulEggWarning, until 9 Nov 2026)', () => {
  it('shown at 168 shifts, hidden at 167 (the 25% boundary)', () => {
    expect(soulEggWarningParts({ planShifts: 167, done: 0 })).toBe(null);
    expect(soulEggWarningParts({ planShifts: 168, done: 0 })).toEqual({
      line: 'This plan would leave about 24% of your soul eggs.',
      fold: 'About 168 shifts since your last Path reset (0 in your save, 168 in the plan) would leave about 24% of the soul eggs you have now. Past about 168 shifts since a Path reset, less than a quarter is left.',
    });
  });

  it("adds the save's shifts since its last Path reset", () => {
    expect(soulEggWarningParts({ planShifts: 100, done: 0 })).toBe(null);
    // 5.9% of the reset's soul eggs left at 200, out of the 83.7% left after the first 100: about 7% of today's.
    expect(soulEggWarningParts({ planShifts: 100, done: 100 })?.fold).toBe(
      'About 200 shifts since your last Path reset (100 in your save, 100 in the plan) would leave about 7% of the soul eggs you have now. Past about 168 shifts since a Path reset, less than a quarter is left.'
    );
  });

  it("the save's count unknown: the plan's shifts only, and it says so", () => {
    expect(soulEggWarningParts({ planShifts: 167, done: null })).toBe(null);
    expect(soulEggWarningParts({ planShifts: 200, done: null })).toEqual({
      line: 'This plan alone would leave about 5% of your soul eggs.',
      fold: "This plan has 200 shifts, counted from 0 shifts: your save's shifts since your last Path reset aren't known here. Past about 168 shifts since a Path reset, less than a quarter is left.",
    });
  });

  it('under 1% reads "under 1%"; the save\'s own soul eggs are used', () => {
    expect(soulEggWarningParts({ planShifts: 240, done: 0, soulEggs: 1e20 })?.line).toBe('This plan would leave under 1% of your soul eggs.');
  });

  it('nothing when the plan keeps no shifts', () => {
    expect(soulEggWarningParts({ planShifts: null, done: 150 })).toBe(null);
    expect(soulEggWarningParts({ planShifts: 0, done: 300 })).toBe(null);
  });

  it('the one long line is gone', () => {
    expect(Object.keys(soulEggs)).not.toContain('soulEggWarning');
  });
});
