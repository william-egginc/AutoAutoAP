import { describe, expect, it } from 'vitest';
import { DEFAULT_EFFORT, EFFORT, EFFORT_NOTES, EFFORT_ORDER, normalizeEffort } from './effort';
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
    expect(effortText('balanced')).toBe('Balanced (retired)');
    expect(foundByText({ effort: 'balanced', space: undefined, recheckOf: undefined } as never)).toBe(
      'Balanced (retired)'
    );
  });

  it('names the Fast and Exact tiers and Custom runs', () => {
    expect(effortText('quick')).toBe('Fast');
    expect(effortText('normal')).toBe('Exact');
    expect(effortText('thorough')).toBe('Very high');
    expect(effortText(undefined)).toBe('unknown');
    const space = { mode: 'bands', stoppedEarly: false } as never;
    expect(foundByText({ effort: 'normal', space } as never)).toBe('Custom');
    expect(foundByText({ effort: 'normal', space: { mode: 'bands', stoppedEarly: true } } as never)).toBe(
      'Custom · partial'
    );
    expect(foundByText({ effort: 'normal', recheckOf: 'x' } as never)).toBe('re-check');
  });

  it('shows a By a date row as Fast or Exact, or Custom, only when it records which', () => {
    expect(foundByText({ effort: 'normal', deadline: 1 } as never)).toBe('normal');
    expect(foundByText({ effort: 'normal', deadline: 1, mode: 'simple' } as never)).toBe('Fast or Exact');
    expect(foundByText({ effort: 'normal', deadline: 1, mode: 'advanced' } as never)).toBe('Custom');
  });

  it("names the at-once check (was Light; no longer named so, 22 Oct), and a Fast or Exact answer's level, once rows record them (15 Oct)", () => {
    expect(foundByText({ effort: 'light' } as never)).toBe('Checked at once');
    expect(foundByText({ effort: 'deadline', deadline: 1, level: 'light' } as never)).toBe('Checked at once');
    expect(foundByText({ effort: 'deadline', deadline: 1, mode: 'simple', level: 'normal' } as never)).toBe(
      'Exact'
    );
    expect(foundByText({ effort: 'deadline', deadline: 1, mode: 'advanced', level: 'exhaustive' } as never)).toBe(
      'Custom'
    );
    expect(foundByText({ effort: 'quick', level: 'quick' } as never)).toBe('Fast');
  });
});

describe("Exact's accuracy words (the math review, 24 Oct 2026)", () => {
  it('says the 4,913 routes were a box with the first two stops, the count and the target fixed', () => {
    const t = EFFORT_NOTES.normal.accuracy;
    expect(t).toContain('4,913 routes');
    expect(t).toContain('kept its first two stops, its number of ascensions and its final target fixed');
    expect(t).not.toContain('plans');
  });
});
