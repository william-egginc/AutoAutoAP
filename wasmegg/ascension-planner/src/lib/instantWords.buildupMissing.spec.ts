/**
 * THE FIRST STEP LINE SAYS WHEN THE BUILD-UP WAS NOT WORKED OUT (design spec, failing first; game expert, 6 Nov 2026).
 *
 * With `buildUpMissing` (search/instantFirstLegs.missing.spec.ts) and a fresh first leg, "First step: prestige now and
 * reach 220 TE" must not read as a plan. It says the build-up could not be worked out, so the answer starts with a fresh
 * prestige and a mid-build-up player should not follow it. (Expected text: Words' wording, 6 Nov 2026.)
 */
import { describe, expect, it } from 'vitest';
import { FIRST_STEP_BUILDUP_MISSING, FIRST_STEP_BUILDUP_MISSING_CONTINUE, buildUpMissingRestOf, firstStepLine } from './instantWords';

const base = { stopTE: 220, reached: 'Jan 1, 2027 at 2:11 AM', prestigeDate: null, prestigeTime: null, sameDay: false, hours: false };

describe('firstStepLine with a build-up that could not be worked out', () => {
  it('warns on a fresh first step', () => {
    const line = firstStepLine({ ...base, kind: 'fresh', buildUpMissing: true } as never);
    expect(line).toMatch(/do not prestige if you are in the middle of a build-up/i);
    expect(line).toMatch(/could not work out your build-up/i);
  });
  it('control: no warning when the build-up was worked out', () => {
    const line = firstStepLine({ ...base, kind: 'fresh' } as never);
    expect(line).not.toMatch(/build-up/i);
  });
  it('control: a build-up first step is unchanged', () => {
    expect(firstStepLine({ ...base, kind: 'buildup' } as never)).toBe('First step: continue your build-up to 220 TE (Jan 1, 2027 at 2:11 AM).');
  });

  // QA, 7 Nov 2026 (build-up job forced to fail): "continue your current ascension to 198 TE (Nov 13 1:15 AM), then
  // prestige at 2:00 AM" in plain style, no warning. A mid-build-up player is told to prestige soon with no hint.
  it('warns on a continue first step too (spec-buildupmissing-continue)', () => {
    const line = firstStepLine({ ...base, kind: 'continue', prestigeDate: 'Nov 13, 2026 at 2:00 AM', buildUpMissing: true } as never);
    expect(line).toMatch(/do not prestige if you are in the middle of a build-up/i);
    expect(line).toMatch(/could not work out your build-up/i);
    expect(line).toMatch(/carries on your current ascension/i);
    expect(line).not.toMatch(/then prestige/i);
    expect(line).toBe(`First step: ${FIRST_STEP_BUILDUP_MISSING_CONTINUE}`);
  });
  it('control: a continue first step without buildUpMissing is unchanged', () => {
    expect(firstStepLine({ ...base, kind: 'continue' } as never)).toBe('First step: continue your current ascension to 220 TE (Jan 1, 2027 at 2:11 AM).');
  });
  it('control: a build-up first step with buildUpMissing is unchanged (it is the build-up)', () => {
    expect(firstStepLine({ ...base, kind: 'buildup', buildUpMissing: true } as never)).toBe('First step: continue your build-up to 220 TE (Jan 1, 2027 at 2:11 AM).');
  });
  it('control: the fresh warning is unchanged', () => {
    expect(firstStepLine({ ...base, kind: 'fresh', buildUpMissing: true } as never)).toBe(`First step: ${FIRST_STEP_BUILDUP_MISSING}`);
  });
  it('the rest of each warning, from its plain text (the page draws the lead bold); none for any other line', () => {
    expect(buildUpMissingRestOf(FIRST_STEP_BUILDUP_MISSING)).toMatch(/starts with a fresh prestige/);
    expect(buildUpMissingRestOf(FIRST_STEP_BUILDUP_MISSING_CONTINUE)).toMatch(/carries on your current ascension/);
    expect(buildUpMissingRestOf('continue your current ascension to 220 TE (Jan 1, 2027 at 2:11 AM).')).toBe('');
    expect(buildUpMissingRestOf('')).toBe('');
  });
});
