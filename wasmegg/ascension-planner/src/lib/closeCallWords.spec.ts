import { describe, expect, it } from 'vitest';
import { CLOSE_CALL_SECONDS, CLOSE_CALL_TAG, closeCallLine, isCloseCall } from './closeCallWords';

const D = 86400;

describe('close call: a By a date answer with under 2 days to spare (13 Nov 2026)', () => {
  it('is a close call under 2 days, only when the quick estimate can be late', () => {
    expect(CLOSE_CALL_SECONDS).toBe(2 * D);
    expect(isCloseCall(19 * 3600 + 6 * 60, true)).toBe(true);
    expect(isCloseCall(1.9 * D, true)).toBe(true);
    expect(isCloseCall(2.1 * D, true)).toBe(false);
    expect(isCloseCall(19 * 3600, false)).toBe(false);
  });
  it('does not say the TE is reached; says it may miss and points to Custom', () => {
    const t = closeCallLine({ te: 314 });
    expect(t).toBe(
      '314 TE is a close call: the quick estimate can be a few days late, so this may miss the date. Run Custom to confirm.'
    );
    expect(t).not.toMatch(/reached|safe/i);
    expect(CLOSE_CALL_TAG).toBe('close call');
  });
  it('points to a Custom result that found a lower TE, and calls it confirmed', () => {
    expect(closeCallLine({ te: 314, found: { level: 'Custom', endTE: 313 } })).toBe(
      'Custom found 313 TE for this date, which is confirmed. The 314 TE above may miss.'
    );
  });
  it('a Custom result at the same TE or higher does not change the line; Fast and Exact are not "confirmed"', () => {
    expect(closeCallLine({ te: 314, found: { level: 'Custom', endTE: 314 } })).toBe(closeCallLine({ te: 314 }));
    expect(closeCallLine({ te: 314, found: { level: 'Fast', endTE: 313 } })).toBe(closeCallLine({ te: 314 }));
  });
});

describe('the instant card shows it (source pin)', async () => {
  const { readFileSync } = await import('node:fs');
  const vue = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
  it('the box uses the close-call line and tag', () => {
    expect(vue).toContain('data-testid="box-close-call"');
    expect(vue).toContain('closeCallLine(');
    expect(vue).toContain('CLOSE_CALL_TAG');
  });
});
