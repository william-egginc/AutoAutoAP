import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFORT, EFFORT, EFFORT_ORDER, normalizeEffort } from './effort';
import { effortText, foundByText } from '@/lib/leaderboardRank';

describe('effort tiers', () => {
  it('has no Balanced tier and defaults to Fast (Simple is meant to be quick)', () => {
    expect(EFFORT_ORDER).toEqual(['quick', 'normal', 'thorough']);
    expect(Object.keys(EFFORT)).not.toContain('balanced');
    expect(DEFAULT_EFFORT).toBe('quick');
  });

  it('reads a stored or linked balanced as exact', () => {
    expect(normalizeEffort('balanced')).toBe('normal');
    expect(normalizeEffort('quick')).toBe('quick');
    expect(normalizeEffort('thorough')).toBe('thorough');
    expect(normalizeEffort('nonsense')).toBe('quick');
    expect(normalizeEffort(undefined)).toBe('quick');
  });

  it('still shows rows already sent as balanced', () => {
    expect(effortText('balanced')).toBe('Nearby routes · Balanced (retired)');
    expect(foundByText({ effort: 'balanced', space: undefined, recheckOf: undefined } as never)).toBe(
      'Nearby routes · Balanced (retired)'
    );
  });

  it('names Smart search tiers Simple and Full sweep runs Advanced', () => {
    expect(effortText('quick')).toBe('Nearby routes · Fast');
    expect(effortText('normal')).toBe('Nearby routes · Exact');
    expect(effortText('thorough')).toBe('Nearby routes · Very high');
    expect(effortText(undefined)).toBe('unknown');
    const space = { mode: 'bands', stoppedEarly: false } as never;
    expect(foundByText({ effort: 'normal', space } as never)).toBe('Exhaustive');
    expect(foundByText({ effort: 'normal', space: { mode: 'bands', stoppedEarly: true } } as never)).toBe(
      'Exhaustive · partial'
    );
    expect(foundByText({ effort: 'normal', recheckOf: 'x' } as never)).toBe('re-check');
  });

  it('shows a By a date row as Simple or Advanced only when it records which', () => {
    expect(foundByText({ effort: 'normal', deadline: 1 } as never)).toBe('normal');
    expect(foundByText({ effort: 'normal', deadline: 1, mode: 'simple' } as never)).toBe('Nearby routes');
    expect(foundByText({ effort: 'normal', deadline: 1, mode: 'advanced' } as never)).toBe('Exhaustive');
  });

  it("names Light, and a Nearby routes answer's level, once rows record them (15 Oct)", () => {
    expect(foundByText({ effort: 'light' } as never)).toBe('Light');
    expect(foundByText({ effort: 'deadline', deadline: 1, level: 'light' } as never)).toBe('Light');
    expect(foundByText({ effort: 'deadline', deadline: 1, mode: 'simple', level: 'normal' } as never)).toBe(
      'Nearby routes · Exact'
    );
    expect(foundByText({ effort: 'deadline', deadline: 1, mode: 'advanced', level: 'exhaustive' } as never)).toBe(
      'Exhaustive'
    );
    expect(foundByText({ effort: 'quick', level: 'quick' } as never)).toBe('Nearby routes · Fast');
  });
});
