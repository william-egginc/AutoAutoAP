import { describe, expect, it, test } from 'vitest';
import { formatDuration, headlineGap, roundedGap } from './format';

describe('formatDuration', () => {
  test('rounds a value a sub-microsecond epsilon under a whole unit up to that unit', () => {
    // Reproduces a real case: a 27h-exact silo credit (see advanceTime.ts's silo-mode `modify_bank`
    // credit) displayed as "1d 2h" instead of "1d 3h" because delta/rate (ActionHistoryItem.vue's
    // display math) landed at 97199.99999999999 seconds, not the theoretically-exact 97200.
    expect(formatDuration(97199.99999999999)).toBe('1d 3h');
    expect(formatDuration(97200)).toBe('1d 3h');
  });

  test('exact round-number durations at every unit boundary', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(90000)).toBe('1d 1h');
  });

  test('only rounds to the nearest whole second, not up to the next unit', () => {
    expect(formatDuration(3599.4)).toBe('59m 59s'); // rounds to 3599s, still short of 1h
    expect(formatDuration(3599.6)).toBe('1h'); // rounds to 3600s, genuinely reaches 1h
    expect(formatDuration(3540)).toBe('59m');
  });

  test('non-finite or negative input', () => {
    expect(formatDuration(Infinity)).toBe('∞');
    expect(formatDuration(-5)).toBe('∞');
  });
});

describe('roundedGap: a dense table rounds (UX review, 25 Oct 2026)', () => {
  const D = 86400;
  it('minutes, hours, days, then years', () => {
    expect(roundedGap(40 * 60, 'en-US')).toBe('40m');
    expect(roundedGap(10, 'en-US')).toBe('1m');
    expect(roundedGap(17.4 * 3600, 'en-US')).toBe('17h 24m');
    expect(roundedGap(3.44 * D, 'en-US')).toBe('3d 11h');
    expect(roundedGap(312.6 * D, 'en-US')).toBe('313d');
    expect(roundedGap(3302.72 * D, 'en-US')).toBe('9 years');
    expect(roundedGap(548 * D, 'en-US')).toBe('1.5 years');
    expect(roundedGap(366 * D, 'en-US')).toBe('1 year');
    expect(roundedGap(-2 * 3600, 'en-US')).toBe('2h');
  });
  it('the compact words in any locale (lib/duration, ux29-d)', () => {
    expect(roundedGap(3.44 * D, 'de-DE')).toBe('3d 11h');
  });
});

describe('headlineGap: the answer\'s headline rounds (UX review, 26 Oct 2026, item 4)', () => {
  const D = 86400;
  it('the compact duration (lib/duration, ux29-d): days and hours under 10 days, whole days, then years', () => {
    expect(headlineGap(5.5 * D, 'en-US')).toBe('5d 12h');
    expect(headlineGap(5.0 * D, 'en-US')).toBe('5d');
    expect(headlineGap(1.02 * D, 'en-US')).toBe('24h 29m');
    expect(headlineGap(12.6 * D, 'en-US')).toBe('13d');
    expect(headlineGap(1857.95 * D, 'en-US')).toBe('5.1 years');
  });
  it('under 48 h in hours and minutes, under an hour in minutes; a negative span keeps its sign', () => {
    expect(headlineGap(17.4 * 3600, 'en-US')).toBe('17h 24m');
    expect(headlineGap(40 * 60, 'en-US')).toBe('40m');
    expect(headlineGap(-2 * 3600, 'en-US')).toBe('−2h');
  });
});
