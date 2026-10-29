import { describe, expect, it } from 'vitest';
import { GEAR_CAVEAT_DAYS, gearCaveat } from './answerCaveat';
import { spareLine, TIGHT_SECONDS } from './spareLine';

const D = 86400;

describe('By a date: the spare and when it is tight (UX review 26 Oct 2026, item 2)', () => {
  it('tight with the gear caveat at 3 days to spare, and says it may be none', () => {
    expect(spareLine(3 * D, true, 'en-US')).toEqual({ text: '3d to spare, maybe none on your gear', tight: true });
  });
  it('not tight with the caveat at 8 days', () => {
    expect(spareLine(8 * D, true, 'en-US')).toEqual({ text: '8d to spare', tight: false });
  });
  it('not tight at 3 days without the caveat', () => {
    expect(spareLine(3 * D, false, 'en-US')).toEqual({ text: '3d to spare', tight: false });
  });
  it('still tight under a day, caveat or not', () => {
    expect(spareLine(17 * 3600, false, 'en-US')).toEqual({ text: '17h to spare', tight: true });
    expect(spareLine(17 * 3600, true, 'en-US').tight).toBe(true);
    expect(TIGHT_SECONDS).toBe(D);
  });
  it('the window is the caveat’s own figure', () => {
    expect(GEAR_CAVEAT_DAYS).toBe(5);
    const c = gearCaveat(
      { gearShift: true, gearDiffers: false, optimistic: false, bonusShort: 0, deliveryScale: 1, fullResearchTe: 340 },
      ''
    );
    expect(c?.line).toContain(`Up to about ${GEAR_CAVEAT_DAYS} days later than shown`);
    expect(spareLine((GEAR_CAVEAT_DAYS - 0.1) * D, true).tight).toBe(true);
    expect(spareLine((GEAR_CAVEAT_DAYS + 0.1) * D, true).tight).toBe(false);
  });
});
