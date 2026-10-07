import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFORT, EFFORT, EFFORT_ORDER, normalizeEffort } from './effort';
import { effortText, foundByText } from '@/lib/leaderboardRank';

describe('effort tiers', () => {
  it('has no Balanced tier and defaults to Exact', () => {
    expect(EFFORT_ORDER).toEqual(['quick', 'normal', 'thorough']);
    expect(Object.keys(EFFORT)).not.toContain('balanced');
    expect(DEFAULT_EFFORT).toBe('normal');
  });

  it('reads a stored or linked balanced as exact', () => {
    expect(normalizeEffort('balanced')).toBe('normal');
    expect(normalizeEffort('quick')).toBe('quick');
    expect(normalizeEffort('thorough')).toBe('thorough');
    expect(normalizeEffort('nonsense')).toBe('normal');
    expect(normalizeEffort(undefined)).toBe('normal');
  });

  it('still shows rows already sent as balanced', () => {
    expect(effortText('balanced')).toBe('Balanced (retired)');
    expect(effortText('normal')).toBe('normal');
    expect(foundByText({ effort: 'balanced', space: undefined, recheckOf: undefined } as never)).toBe(
      'Balanced (retired)'
    );
  });
});
