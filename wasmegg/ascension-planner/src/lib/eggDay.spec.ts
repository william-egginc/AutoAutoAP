import { describe, expect, it } from 'vitest';
import { eggDaySeconds, nextEggDayYear } from './eggDay';

describe('Egg Day', () => {
  it('is 14 July at 9:00 AM Pacific (16:00 UTC in summer time)', () => {
    expect(new Date(eggDaySeconds(2027) * 1000).toISOString()).toBe('2027-07-14T16:00:00.000Z');
  });
  it('is next year once this year has started', () => {
    expect(nextEggDayYear(Date.parse('2026-09-29T12:00:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T15:59:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T16:00:00Z'))).toBe(2028);
  });
});

describe('telling an Egg Day deadline from any other', () => {
  it('knows the exact moment, and nothing else', async () => {
    const { eggDayYearOf } = await import('./eggDay');
    expect(eggDayYearOf(eggDaySeconds(2027))).toBe(2027);
    expect(eggDayYearOf(eggDaySeconds(2027) + 60)).toBeNull();
  });
});
