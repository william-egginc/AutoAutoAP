import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_TARGET_TE, targetTeFault } from './targetTeList';

describe('targetTeFault', () => {
  it('allows a list that is at most 490, with the first above the TE you have and each after it higher', () => {
    expect(targetTeFault('300 400 490', 250)).toBeNull();
    expect(targetTeFault('251', 250)).toBeNull();
    expect(targetTeFault('300 301', 0)).toBeNull();
    expect(MAX_TARGET_TE).toBe(490);
  });
  it('blank is a fault', () => {
    expect(targetTeFault('', 100)).toEqual({ kind: 'empty' });
    expect(targetTeFault('   ', 100)).toEqual({ kind: 'empty' });
    expect(targetTeFault('0', 0)).toEqual({ kind: 'empty' });
  });
  it('over 490 is a fault, wherever it sits', () => {
    expect(targetTeFault('491', 100)).toEqual({ kind: 'tooHigh', value: 491 });
    expect(targetTeFault('300 500', 100)).toEqual({ kind: 'tooHigh', value: 500 });
  });
  it('the first at or under your TE is a fault (ValidationDialog: equal is invalid)', () => {
    expect(targetTeFault('250', 250)).toEqual({ kind: 'belowCurrent', value: 250, current: 250 });
    expect(targetTeFault('249 300', 250)).toEqual({ kind: 'belowCurrent', value: 249, current: 250 });
  });
  it('a number equal to or under the one before is a fault (each above the last, as lib/follow.ts)', () => {
    expect(targetTeFault('300 300', 100)).toEqual({ kind: 'descending', value: 300, previous: 300 });
    expect(targetTeFault('300 299', 100)).toEqual({ kind: 'descending', value: 299, previous: 300 });
    expect(targetTeFault('300 400 350', 100)).toEqual({ kind: 'descending', value: 350, previous: 400 });
  });
});

describe('AutomaticPlanner.vue', () => {
  const src = readFileSync(new URL('../components/auto/AutomaticPlanner.vue', import.meta.url), 'utf8');
  it('shows the fault under the field and keeps Generate Plan off while there is one', () => {
    expect(src).toContain('data-testid="target-te-fault"');
    expect(src).toMatch(/:disabled="isGenerating \|\| !!targetFault"/);
    expect(src).toContain('targetTeFault(targetTE.value, truthEggsStore.totalTE)');
    expect(src).toContain('TARGET_TE_ORDER');
    expect(src).toContain('TARGET_TE_TOO_HIGH');
    expect(src).toContain('targetTeTooLow(');
  });
  it('Enter in the field does not generate while there is a fault', () => {
    expect(src).toMatch(/const runGenerate = \(\) => \{\s*if \(targetFault\.value\) return;/);
  });
});
