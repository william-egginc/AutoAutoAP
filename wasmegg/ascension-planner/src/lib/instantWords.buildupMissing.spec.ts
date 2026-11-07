/**
 * THE FIRST STEP LINE SAYS WHEN THE BUILD-UP WAS NOT WORKED OUT (design spec, failing first; game expert, 6 Nov 2026).
 *
 * With `buildUpMissing` (search/instantFirstLegs.missing.spec.ts) and a fresh first leg, "First step: prestige now and
 * reach 220 TE" must not read as a plan. It says the build-up could not be worked out, so the answer starts with a fresh
 * prestige and a mid-build-up player should not follow it. (Expected text: Words' wording, 6 Nov 2026.)
 */
import { describe, expect, it } from 'vitest';
import { firstStepLine } from './instantWords';

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
});
