/**
 * U2.2 of the code review (22 Nov 2026, dead-ui-5): ChainSearchPanel's non-embedded and own-effort-slider branches and InsanePanel's
 * `embedded` prop can never render (every mount passes them: FastestRoute.vue, ByDateScreen.vue), so they are gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const tpl = (src: string) => src.slice(0, src.indexOf('<script setup'));

describe('ChainSearchPanel is always the Stronger check box\'s own', () => {
  const src = read('ChainSearchPanel.vue');
  it('no embedded or levelElsewhere prop, and no branch on them', () => {
    expect(src).not.toMatch(/\bembedded\b/);
    expect(src).not.toMatch(/levelElsewhere/);
    expect(src).not.toMatch(/level-elsewhere/);
  });
  it('the effort slider, its accuracy text and NEAR_OPTIMAL_SHARE are gone', () => {
    expect(src).not.toContain('NEAR_OPTIMAL_SHARE');
    expect(src).not.toContain('effort-range');
    expect(src).not.toContain('Measured accuracy');
    expect(src).not.toContain('effortIndex');
  });
  it('the four-card start row and the saved-runs list are gone from it', () => {
    expect(src).not.toContain('chain-search-seed');
    expect(src).not.toContain('<SavedRuns');
  });
  it('the mount no longer passes them', () => {
    const f = read('FastestRoute.vue');
    expect(f).not.toMatch(/<ChainSearchPanel[^>]*\b(embedded|level-elsewhere)\b/s);
  });
});

describe('effort.ts: no accuracy field', () => {
  const eff = read('../../search/effort.ts');
  it('EFFORT_NOTES carries no measured-accuracy text', () => {
    expect(eff).not.toMatch(/\baccuracy\b/);
  });
});

describe('InsanePanel: embedded is gone', () => {
  const src = read('InsanePanel.vue');
  it('no embedded prop', () => {
    expect(src).not.toMatch(/\bembedded\b/);
  });
  it('the mounts do not pass it', () => {
    expect(read('ByDateScreen.vue')).not.toMatch(/<InsanePanel[^>]*\bembedded\b/);
    expect(read('FastestRoute.vue')).not.toMatch(/<InsanePanel[^>]*\bembedded\b/);
  });
  it('template root has no frame fallback', () => {
    expect(tpl(src)).not.toContain('section-premium p-4 sm:p-8');
  });
});
