import { describe, expect, it } from 'vitest';
import { FULL_RESEARCH_TE, earningsBonus, gearDiffers, gearDiffersText } from './gearDiffers';

describe('your gear isn’t the table’s (gearDiffers)', () => {
  it('shows below TE 340 when the delivery or the earnings set is off', () => {
    expect(gearDiffers(142, { bonusShort: 0, scale: 0.936 })).toBe(true);
    expect(gearDiffers(142, { bonusShort: 2, scale: 1 })).toBe(true);
    expect(gearDiffers(339.9, { bonusShort: 0, scale: 0.99 })).toBe(true);
  });

  it('stays quiet from TE 340, and for the table’s own gear', () => {
    expect(gearDiffers(FULL_RESEARCH_TE, { bonusShort: 5, scale: 0.8 })).toBe(false);
    expect(gearDiffers(142, { bonusShort: 0.05, scale: 1.004 })).toBe(false);
  });

  it('says how far off, in a player’s words', () => {
    expect(gearDiffersText({ bonusShort: 0, scale: 0.9357 })).toMatch(/^Your gear isn’t the gear the instant answer was built on \(delivery 93\.6% of its at full research\)\./);
    expect(gearDiffersText({ bonusShort: 1.234, scale: 1 })).toContain('(earnings set 1.23 Clothed TE short, delivery 100.0%');
    expect(gearDiffersText({ bonusShort: 0, scale: 1 })).toContain('“Import into the planner” gives your own times.');
  });

  it('reads no bonus without a save', () => {
    expect(earningsBonus(null)).toBe(0);
  });
});
