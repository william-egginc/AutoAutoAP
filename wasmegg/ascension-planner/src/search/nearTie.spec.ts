import { describe, expect, it } from 'vitest';
import { gapWords, nearTieOf } from './nearTie';

describe('near-tie note on the counts table', () => {
  it('more ascensions than the fastest: one more prestige for no gain', () => {
    expect(nearTieOf(8, 7, 0.04 * 86400)).toEqual({
      kind: 'more',
      text: 'about the same: one more prestige for no gain',
    });
    expect(nearTieOf(9, 7, 100)?.kind).toBe('more');
  });

  it('fewer ascensions: one fewer prestige, only about N h later, with the real gap', () => {
    expect(nearTieOf(6, 7, 0.04 * 86400)).toEqual({ kind: 'fewer', text: 'one fewer prestige, only ~1 h later' });
    expect(nearTieOf(6, 7, 0.09 * 86400)).toEqual({ kind: 'fewer', text: 'one fewer prestige, only ~2 h later' });
    expect(nearTieOf(5, 7, 0.08 * 86400)).toEqual({ kind: 'fewer', text: '2 fewer prestiges, only ~2 h later' });
    expect(nearTieOf(6, 7, 600)).toEqual({ kind: 'fewer', text: 'one fewer prestige, only under an hour later' });
  });

  it('the same number of ascensions says nothing', () => {
    expect(nearTieOf(7, 7, 3600)).toBeNull();
  });

  it('gap words', () => {
    expect(gapWords(1200)).toBe('under an hour');
    expect(gapWords(3600)).toBe('~1 h');
    expect(gapWords(2.4 * 3600)).toBe('~2 h');
  });
});
