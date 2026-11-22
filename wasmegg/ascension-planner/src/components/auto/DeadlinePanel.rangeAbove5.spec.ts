/**
 * U3.6 of the code review (22 Nov 2026, ui-panels-4): Nearby routes says "the save has to load first" when the real cause is a
 * range that starts above 5 ascensions with no instant answer (the suggested routes only cover 1 to 5). A plain reason comes
 * first, in the Find's issue and in the Settings fold. The words are DRAFT for Words (W2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEARBY_RANGE_ABOVE_SUGGESTIONS } from '@/lib/nearbyRangeWords';

const src = fs.readFileSync(path.resolve(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script setup'));

describe('a range above 5 with no instant answer', () => {
  it('has its own reason, plain, and not the save-load one', () => {
    expect(NEARBY_RANGE_ABOVE_SUGGESTIONS.length).toBeGreaterThan(20);
    expect(NEARBY_RANGE_ABOVE_SUGGESTIONS).not.toMatch(/save has to load/);
  });
  it('suggestedRangeEmpty: a save loaded, no instant routes, and a range starting above what the suggestions cover', () => {
    expect(src).toMatch(
      /const suggestedRangeEmpty = computed\(\s*\(\) =>\s*store\.currentTE > 0 &&\s*!Object\.keys\(instantCentres\.value\)\.length &&\s*nearbyRange\.value\.min > Math\.min\(5, instantMax\.value \?\? 5\)\s*\);/
    );
  });
  it('aroundIssue returns it before the save line', () => {
    const fn = src.slice(src.indexOf('const aroundIssue = computed'), src.indexOf('const canStartAround'));
    expect(fn.indexOf('suggestedRangeEmpty.value')).toBeGreaterThan(-1);
    expect(fn.indexOf('suggestedRangeEmpty.value')).toBeLessThan(fn.indexOf('the save has to load first'));
    expect(fn).toContain('return NEARBY_RANGE_ABOVE_SUGGESTIONS;');
  });
  it('the Settings fold says it too, instead of "nothing to check yet"', () => {
    expect(template).toContain('suggestedRangeEmpty');
    expect(template).toContain('NEARBY_RANGE_ABOVE_SUGGESTIONS');
  });
});
