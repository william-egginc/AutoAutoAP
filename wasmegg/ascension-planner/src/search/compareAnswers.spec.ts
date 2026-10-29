import { describe, expect, it } from 'vitest';
import { compareRows, pick } from './compareAnswers';

const f = (end: number, extra = {}) => ({ chain: [200, 490], end, endTE: 490, ...extra });
const d = (endTE: number, spare: number) => ({ chain: [160, endTE], end: 0, endTE, spare });

describe('compareRows', () => {
  it('Fastest: the soonest finish is best; missing ones say so', () => {
    const rows = compareRows('fastest', { instant: f(1000), stronger: f(900), exhaustive: null });
    expect(rows.map(r => [r.label, r.best, !!r.entry])).toEqual([
      ['Instant answer', false, true],
      ['Search', true, true],
      ['Custom', false, false],
    ]);
  });
  it('By a date: the highest TE, then the most spare', () => {
    const rows = compareRows('date', { instant: d(248, 10), stronger: d(248, 50), exhaustive: d(247, 900) });
    expect(rows.find(r => r.best)?.id).toBe('stronger');
  });
  it('no best marked with only one answer, or when nothing beats the instant answer', () => {
    expect(compareRows('fastest', { instant: f(1000), stronger: null, exhaustive: null }).some(r => r.best)).toBe(false);
    expect(compareRows('fastest', { instant: f(1000), stronger: f(1000), exhaustive: null }).find(r => r.best)?.id).toBe(
      'instant'
    );
  });
  it('pick: the better of two, either may be missing', () => {
    expect(pick('fastest', null, f(5))?.end).toBe(5);
    expect(pick('fastest', f(5), f(4))?.end).toBe(4);
    expect(pick('date', d(247, 1), null)?.endTE).toBe(247);
  });
});
