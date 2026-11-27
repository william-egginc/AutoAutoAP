import { describe, expect, it } from 'vitest';
import { FOLLOW_CANNOT_LATER, FOLLOW_CANNOT_LATER_NOTE, followCannotLine, followOldPlanLabel } from './followMissWords';

describe('no route makes the date (Words, 17 Nov 2026)', () => {
  const all = [
    followCannotLine('Jul 14, 2027', false),
    followCannotLine('Jul 14, 2027', true),
    FOLLOW_CANNOT_LATER,
    FOLLOW_CANNOT_LATER_NOTE,
    followOldPlanLabel('Nov 14, 2026 at 9:00 AM'),
  ];
  it('each is under 170 characters, with no banned phrase', () => {
    for (const s of all) {
      expect(s.length).toBeLessThan(170);
      expect(s).not.toMatch(/this device|this computer|^Your plan|[io]n your plan/i);
    }
  });
  it('says the date or Egg Day', () => {
    expect(all[0]).toContain('No route can make Jul 14, 2027 now');
    expect(all[1]).toContain('No route can make Egg Day now');
  });
  it("'See By a date for this date' is gone: searching the same date again cannot help (orchestrator, 17 Nov 2026)", async () => {
    expect(await import('./followMissWords')).not.toHaveProperty('FOLLOW_CANNOT_SEE');
  });
});
