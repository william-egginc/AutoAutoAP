import { describe, expect, it } from 'vitest';
import { fastestEntry, gridIsComplete, gridStepLabel, polishChainEstimate } from './polish';

const band = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

describe('the grid a sweep covered', () => {
  it('knows a step-1 sweep already tried every TE', () => {
    expect(gridIsComplete([band(183, 489, 1)])).toBe(true);
    expect(gridIsComplete(undefined, 1)).toBe(true);
  });

  it('knows a step-5 sweep did not (the M3 case)', () => {
    const m3 = [band(181, 250, 5), band(215, 300, 5), band(280, 360, 5)];
    expect(gridIsComplete(m3)).toBe(false);
    expect(m3[0]).not.toContain(227);
    expect(gridStepLabel(m3)).toBe('every 5 TE');
  });

  it('says so in words', () => {
    expect(gridStepLabel([band(183, 489, 1)])).toBe('every TE');
    expect(gridStepLabel([band(181, 280, 2), band(270, 372, 5)])).toBe('every 2 to 5 TE');
    expect(gridStepLabel(undefined, 10)).toBe('every 10 TE');
  });
});

describe('polishing', () => {
  it('estimates a few hundred chains for a 3-checkpoint winner', () => {
    const n = polishChainEstimate(3);
    expect(n).toBeGreaterThan(500);
    expect(n).toBeLessThan(1000);
  });

  it('starts from the fastest priced chain', () => {
    expect(fastestEntry([{ key: 'a', seconds: 3 }, { key: 'b', seconds: 2 }, { key: 'c', seconds: 0 }])?.key).toBe('b');
    expect(fastestEntry([])).toBeNull();
  });
});
