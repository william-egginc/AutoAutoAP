/**
 * The Full timeline's build-up line (lib/buildUpLine.ts, 26 Oct 2026): the sale count from the variant, the rate the
 * build produces at, each left out when not known.
 */
import { describe, expect, it } from 'vitest';
import { buildUpLine, buildUpSales, ratePerHour } from './buildUpLine';

// 3.574q/hr in eggs per second.
const RATE = 3.574e15 / 3600;

describe('buildUpSales', () => {
  it('reads the sales from every build variant, none from continue or the build-up', () => {
    expect(['1-sale', '2-sale', '3-sale', '1-sale-tier13', '2-sale-tier13', '3-sale-tier13'].map(buildUpSales)).toEqual([
      1, 2, 3, 1, 2, 3,
    ]);
    expect(['continue', 'buildup', 'first', '', 'sale', '2-sale-x'].map(buildUpSales)).toEqual([null, null, null, null, null, null]);
    expect(buildUpSales(undefined)).toBeNull();
    expect(buildUpSales(null)).toBeNull();
  });
});

describe('buildUpLine', () => {
  it('the sales and the rate, "sale" singular for one', () => {
    expect(buildUpLine({ label: '2-sale-tier13', peakELR: RATE })).toBe('You do the build-up for 2 sales, then start producing at 3.574q/hr');
    expect(buildUpLine({ label: '1-sale-tier13', peakELR: RATE })).toBe('You do the build-up for 1 sale, then start producing at 3.574q/hr');
    expect(buildUpLine({ label: '3-sale-tier13', peakELR: RATE })).toBe('You do the build-up for 3 sales, then start producing at 3.574q/hr');
    expect(buildUpLine({ label: '1-sale', peakELR: RATE })).toBe('You do the build-up for 1 sale, then start producing at 3.574q/hr');
    expect(buildUpLine({ label: '2-sale', peakELR: RATE })).toBe('You do the build-up for 2 sales, then start producing at 3.574q/hr');
    expect(buildUpLine({ label: '3-sale', peakELR: RATE })).toBe('You do the build-up for 3 sales, then start producing at 3.574q/hr');
  });

  it('the rate as the page writes rates (lib/nowPhase.ts): per hour, three decimals, the suffix', () => {
    expect(ratePerHour(RATE)).toBe('3.574q/hr');
    expect(ratePerHour(1.2345e18 / 3600)).toBe('1.234Q/hr');
  });

  it('continue and the build-up of the save\'s farm: no line, whatever the rate', () => {
    expect(buildUpLine({ label: 'continue', peakELR: RATE })).toBeNull();
    expect(buildUpLine({ label: 'buildup', peakELR: RATE })).toBeNull();
    expect(buildUpLine({ label: 'first', peakELR: RATE })).toBeNull();
  });

  it('no rate: the sales alone, never a guessed rate', () => {
    expect(buildUpLine({ label: '2-sale-tier13' })).toBe('You do the build-up for 2 sales');
    expect(buildUpLine({ label: '2-sale', peakELR: null })).toBe('You do the build-up for 2 sales');
    expect(buildUpLine({ label: '2-sale', peakELR: 0 })).toBe('You do the build-up for 2 sales');
    expect(buildUpLine({ label: '2-sale', peakELR: NaN })).toBe('You do the build-up for 2 sales');
    expect(buildUpLine({ label: '2-sale', peakELR: Infinity })).toBe('You do the build-up for 2 sales');
  });

  it('no sale count: nothing', () => {
    expect(buildUpLine({ peakELR: RATE })).toBeNull();
    expect(buildUpLine({})).toBeNull();
    expect(buildUpLine(null)).toBeNull();
    expect(buildUpLine(undefined)).toBeNull();
  });

  it('a simulated leg: its variant wins over the table\'s label (continue → none, a build → its sales)', () => {
    expect(buildUpLine({ variant: '3-sale-tier13', label: '1-sale', peakELR: RATE })).toBe(
      'You do the build-up for 3 sales, then start producing at 3.574q/hr'
    );
    expect(buildUpLine({ variant: 'continue', label: '2-sale', peakELR: RATE })).toBeNull();
    expect(buildUpLine({ variant: 'buildup', label: '2-sale', peakELR: RATE })).toBeNull();
  });
});
