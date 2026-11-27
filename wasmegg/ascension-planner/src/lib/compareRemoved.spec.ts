/**
 * The hidden "Compare the answers" block is gone (Jordan, 22 Nov 2026: "#14 delete Compare YES"): its component, its
 * row rules, its snapshots and its switch. What By a date's default box count reads (`stronger.instant`) stays.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), 'utf8');

describe('Compare is deleted', () => {
  it('the files are gone', () => {
    for (const f of [
      'components/auto/SearchCompare.vue',
      'components/auto/SearchCompare.spec.ts',
      'search/compareAnswers.ts',
      'search/compareAnswers.spec.ts',
      'composables/useSearchSnapshots.ts',
      'lib/features.ts',
    ])
      expect(existsSync(at(f)), f).toBe(false);
  });
  it('the screens do not mention it', () => {
    for (const f of ['components/auto/FastestRoute.vue', 'components/auto/DeadlinePanel.vue']) {
      const s = read(f);
      expect(s, f).not.toMatch(/SearchCompare|SHOW_COMPARE|useSearchSnapshots/);
    }
  });
  it('the store keeps the level and the instant answer By a date reads, and drops the comparison feeders', () => {
    const s = read('stores/stronger.ts');
    expect(s).toContain('const instant = ref');
    expect(s).toContain('level');
    expect(s).not.toMatch(/strongerBest|lastSearch|SearchCompare/);
  });
});
