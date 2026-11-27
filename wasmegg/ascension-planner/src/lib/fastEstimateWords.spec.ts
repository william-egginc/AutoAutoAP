/** Fast's estimate line (9 Nov 2026): the typical first, the bound in brackets (it read as a hedge after the estimate). */
import { describe, expect, it } from 'vitest';
import { typicalHowLongLine } from './fastEstimateWords';
import { isWordingOnly } from './resultCodeHash';

const base = { time: '43 min', device: 'this phone', workers: '2 workers', speed: '3 routes/s', typical: 700, bound: 915 };

describe('typicalHowLongLine', () => {
  it("on this device's runs", () => {
    expect(typicalHowLongLine({ ...base, from: 'here' })).toBe(
      'About 43 min on this phone (2 workers, 3 routes/s): about 700 routes, as its runs here have priced (up to ~915).'
    );
  });
  it('on a first run, from what Fast runs typically price', () => {
    expect(typicalHowLongLine({ ...base, from: 'default' })).toBe(
      'About 43 min on this phone (2 workers, 3 routes/s): about 700 routes, what Fast runs typically price (up to ~915).'
    );
  });
  it('no "at most" hedge, and a wording-only file', () => {
    expect(typicalHowLongLine({ ...base, from: 'here' })).not.toMatch(/at most/);
    expect(isWordingOnly('src/lib/fastEstimateWords.ts')).toBe(true);
  });
});
