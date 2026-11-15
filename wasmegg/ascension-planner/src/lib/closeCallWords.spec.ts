import { describe, expect, it } from 'vitest';
import { CHECK_WITH_FAST, CLOSE_CALL_SECONDS, CLOSE_CALL_TAG, closeCallLine, isCloseCall, showCheckWithFast } from './closeCallWords';

const D = 86400;

describe('close call: a By a date answer with under 2 days to spare (13 Nov 2026)', () => {
  it('is a close call under 2 days, only when the quick estimate can be late', () => {
    expect(CLOSE_CALL_SECONDS).toBe(2 * D);
    expect(isCloseCall(19 * 3600 + 6 * 60, true)).toBe(true);
    expect(isCloseCall(1.9 * D, true)).toBe(true);
    expect(isCloseCall(2.1 * D, true)).toBe(false);
    expect(isCloseCall(19 * 3600, false)).toBe(false);
  });
  it('is also a close call when the awake hours limit the answer (review T3: hours-on answers came out days early)', () => {
    expect(isCloseCall(19 * 3600, false, true)).toBe(true);
    expect(isCloseCall(1.9 * D, false, true)).toBe(true);
    expect(isCloseCall(2.1 * D, false, true)).toBe(false);
    expect(isCloseCall(19 * 3600, false, false)).toBe(false);
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
  it('a finished Custom result at the same TE or higher confirms it: no close-call line at all (review T12); Fast and Exact do not confirm', () => {
    expect(closeCallLine({ te: 314, found: { level: 'Custom', endTE: 314 } })).toBeNull();
    expect(closeCallLine({ te: 314, found: { level: 'Custom', endTE: 315.4 } })).toBeNull();
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

describe('the prompt to check a close call with Fast (Jordan, 15 Nov 2026)', () => {
  it('shows for a close call that nothing has settled and nothing is running', () => {
    expect(showCheckWithFast({ closeCall: true, found: null, running: false })).toBe(true);
    // Fast or Exact results do not settle it; only a Custom one does (closeCallLine).
    expect(showCheckWithFast({ closeCall: true, found: { level: 'Fast', endTE: 313 }, running: false })).toBe(true);
  });
  it('never for an answer that is not a close call', () => {
    expect(showCheckWithFast({ closeCall: false, found: null, running: false })).toBe(false);
  });
  it('not while a run is going, nor once a Custom result has settled the date', () => {
    expect(showCheckWithFast({ closeCall: true, found: null, running: true })).toBe(false);
    expect(showCheckWithFast({ closeCall: true, found: { level: 'Custom', endTE: 313 }, running: false })).toBe(false);
  });
  it('any close-call reason counts: the spare under the budget, the awake hours, a form G below reach', () => {
    const D = 86400;
    for (const [spare, gear, hours] of [
      [19 * 3600, true, false],
      [19 * 3600, false, true],
      [1 * D, true, true],
    ] as const)
      expect(showCheckWithFast({ closeCall: isCloseCall(spare, gear, hours), found: null, running: false })).toBe(true);
    expect(showCheckWithFast({ closeCall: isCloseCall(19 * 3600, false, false), found: null, running: false })).toBe(false);
    expect(showCheckWithFast({ closeCall: isCloseCall(3 * D, true, true), found: null, running: false })).toBe(false);
  });
  it('the words (a draft: Words writes them)', () => {
    expect(CHECK_WITH_FAST).toBe('Check this with Fast');
  });
});

describe('the prompt is wired (source pin)', async () => {
  const { readFileSync } = await import('node:fs');
  const vue = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../components/auto/DeadlinePanel.vue', import.meta.url), 'utf8');
  it('the box shows a button under the close-call line that asks the panel for a Fast run', () => {
    expect(vue).toContain('data-testid="box-check-fast"');
    expect(vue).toContain("emit('check-fast')");
    expect(vue).toMatch(/'check-fast': \[\];/);
    expect(vue).toContain('showCheckWithFast(');
    expect(vue).toContain('CHECK_WITH_FAST');
  });
  it('By a date starts Fast for this goal: the level is Fast and the run is Nearby routes\' own', () => {
    expect(panel).toContain('@check-fast="checkWithFast"');
    expect(panel).toMatch(/function checkWithFast\(\): void \{[\s\S]*?stronger\.level = 'quick';[\s\S]*?void start\(false, 'around'\);[\s\S]*?\n\}/);
    expect(panel).toMatch(/function checkWithFast\(\): void \{[\s\S]*?canStartAround\.value/);
  });
});
