import { describe, it, expect } from 'vitest';
import { parseHighlightValues, MAX_HIGHLIGHT_VALUES } from './highlight';

describe('parseHighlightValues', () => {
  it('reads the three ways people actually type a short list', () => {
    expect(parseHighlightValues('195, 196, 197')).toEqual([195, 196, 197]);
    expect(parseHighlightValues('195 196 197')).toEqual([195, 196, 197]);
    expect(parseHighlightValues('195;196;197')).toEqual([195, 196, 197]);
  });

  it('expands a range one TE at a time, not on a band parser grid', () => {
    // The whole reason this is not `parseBand`: there, a bare `195-200` means step 5 and drops
    // four of the six values. Here it means the six values.
    expect(parseHighlightValues('195-200')).toEqual([195, 196, 197, 198, 199, 200]);
    expect(parseHighlightValues('195–197')).toEqual([195, 196, 197]);
  });

  it('sorts and de-duplicates, so the legend order follows the numbers', () => {
    expect(parseHighlightValues('197, 195, 197, 196')).toEqual([195, 196, 197]);
  });

  it('caps a wide range at the lowest values rather than refusing it', () => {
    const values = parseHighlightValues('195-260');
    expect(values).toHaveLength(MAX_HIGHLIGHT_VALUES);
    expect(values[0]).toBe(195);
    expect(values[values.length - 1]).toBe(195 + MAX_HIGHLIGHT_VALUES - 1);
  });

  it('treats half-typed and unreadable input as no highlight, not as an error', () => {
    // This runs on every keystroke, so `19` on the way to `195` has to be harmless.
    expect(parseHighlightValues('')).toEqual([]);
    expect(parseHighlightValues('   ')).toEqual([]);
    expect(parseHighlightValues('abc')).toEqual([]);
    expect(parseHighlightValues('195-')).toEqual([]);
    expect(parseHighlightValues('200-195')).toEqual([]);
  });

  it('keeps the readable half of a partly unreadable list', () => {
    expect(parseHighlightValues('195, oops, 197')).toEqual([195, 197]);
  });
});
