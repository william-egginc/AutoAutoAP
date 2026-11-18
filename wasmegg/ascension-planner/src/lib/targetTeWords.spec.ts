import { describe, expect, it } from 'vitest';
import { TARGET_TE_ORDER, TARGET_TE_TOO_HIGH, targetTeRules, targetTeTooLow } from './targetTeWords';

describe('Target TE(s) inline error (Words, 17 Nov 2026)', () => {
  it('says the range and the order, or each broken rule on its own', () => {
    expect(targetTeRules(220.4)).toBe('Enter targets from 220 to 490, each at least as high as the one before.');
    expect(TARGET_TE_TOO_HIGH).toBe('Target TE can be 490 at most.');
    expect(targetTeTooLow(220)).toBe("Target TE can't be below your current TE (220).");
    expect(TARGET_TE_ORDER).toBe('Each target must be at least as high as the one before.');
  });
  it('each is under 170 characters, with no banned phrase', () => {
    for (const s of [targetTeRules(220), TARGET_TE_TOO_HIGH, targetTeTooLow(220), TARGET_TE_ORDER]) {
      expect(s.length).toBeLessThan(170);
      expect(s).not.toMatch(/this device|this computer|^Your plan|[io]n your plan/i);
    }
  });
});
