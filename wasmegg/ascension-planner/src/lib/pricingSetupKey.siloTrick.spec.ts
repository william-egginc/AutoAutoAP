/** My Runs' pricing record and the silo trick (code review round 2, 22 Nov 2026, R7.2): keyed only when on, as instantKey. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pricingSetupKey } from './followEstimate';

const base = {
  availability: null,
  timeOff: [],
  noPrestige: [],
  useHours: false,
  firstAscension: 'auto',
  zone: 'America/Denver',
  deferShifts: true,
  target: 490,
};
const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('pricingSetupKey and the silo trick', () => {
  it('off (or absent) leaves every key as it was', () => {
    expect(pricingSetupKey({ ...base, siloTrick: false })).toBe(pricingSetupKey(base));
  });
  it('on is a different key', () => {
    expect(pricingSetupKey({ ...base, siloTrick: true })).not.toBe(pricingSetupKey(base));
  });
  it('both pages that keep the record pass it', () => {
    expect(src('../composables/useNowPage.ts')).toContain('siloTrick: !!store.siloTrick,');
    expect(src('../components/auto/InstantRoute.vue')).toContain('siloTrick: !!store.siloTrick,');
  });
});
