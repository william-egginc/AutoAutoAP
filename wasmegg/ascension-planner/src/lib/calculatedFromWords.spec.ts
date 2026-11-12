import { describe, expect, it } from 'vitest';
import { calculatedFromLine } from './calculatedFromWords';

const Z = 'America/Denver';
const at = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h + 7, mi) / 1000; // MST = UTC-7 in Nov

describe('the Right now "Calculated from" line', () => {
  it('an earlier day: dates with a comma, so no "at … at"', () => {
    const l = calculatedFromLine({ saveSeconds: at(2026, 11, 11, 10, 29), nowSeconds: at(2026, 11, 12, 15, 40), zone: Z });
    expect(l).toMatch(/^Calculated from your Nov 11, 10:29\s?AM save at Nov 12, 3:40\s?PM$/);
    expect(l).not.toMatch(/ at .* at /);
  });
  it('the same day: just the times', () => {
    expect(calculatedFromLine({ saveSeconds: at(2026, 11, 12, 10, 29), nowSeconds: at(2026, 11, 12, 15, 40), zone: Z })).toMatch(
      /^Calculated from your 10:29\s?AM save at 3:40\s?PM$/
    );
  });
  it('a year shows only when it is not now\'s', () => {
    expect(calculatedFromLine({ saveSeconds: at(2025, 12, 30, 10, 29), nowSeconds: at(2026, 1, 2, 9, 0), zone: Z })).toMatch(/Dec 30, 2025, 10:29/);
  });
  it('unknown save: nothing', () => {
    expect(calculatedFromLine({ saveSeconds: null, nowSeconds: 1, zone: Z })).toBe('');
  });
});
