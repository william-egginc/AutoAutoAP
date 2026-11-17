/**
 * The level whose estimate the chip beside Run shows (QA, 16 Nov 2026: the long-search line read a different estimate from the
 * chip). The chips (Fast ~24 min, Exact ~1.2 h) take their time from the selected level, `stronger.level`; the run controls
 * must too, falling back to the search's effort only when the level is not one of the three that have an estimate.
 */
import { describe, expect, it } from 'vitest';
import { chipLevel } from './searchOption';

describe('chipLevel', () => {
  it('the selected chip wins over a remembered effort', () => {
    expect(chipLevel('quick', 'thorough')).toBe('quick');
    expect(chipLevel('normal', 'thorough')).toBe('normal');
    expect(chipLevel('thorough', 'quick')).toBe('thorough');
  });
  it('Light searches nothing and shows Fast (the level bar says so): its estimate is Fast\'s', () => {
    expect(chipLevel('light', 'thorough')).toBe('quick');
  });
  it('no usable level: the effort, and Fast when that is no level either', () => {
    expect(chipLevel(undefined, 'normal')).toBe('normal');
    expect(chipLevel(null, 'balanced')).toBe('normal');
    expect(chipLevel(null, 'boxes')).toBe('quick');
    expect(chipLevel('weird', undefined)).toBe('quick');
  });
});
