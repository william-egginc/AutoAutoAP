import { describe, expect, it } from 'vitest';
import { TARGET_TE_ORDER, TARGET_TE_TOO_HIGH, targetTeTooLow } from './targetTeWords';

describe('Target TE(s) inline error (Words, 17 Nov 2026)', () => {
  it('says each broken rule on its own', () => {
    expect(TARGET_TE_TOO_HIGH).toBe('Target TE can be 490 at most.');
    expect(targetTeTooLow(220)).toBe("Target TE must be above your current TE (220).");
    expect(TARGET_TE_ORDER).toBe('Each target must be higher than the one before.');
  });
  it('each is under 170 characters, with no banned phrase', () => {
    for (const s of [TARGET_TE_TOO_HIGH, targetTeTooLow(220), TARGET_TE_ORDER]) {
      expect(s.length).toBeLessThan(170);
      expect(s).not.toMatch(/this device|this computer|^Your plan|[io]n your plan/i);
    }
  });
});
