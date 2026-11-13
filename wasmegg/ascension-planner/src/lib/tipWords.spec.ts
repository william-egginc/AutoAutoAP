/** The button tips (11 Nov 2026; Allan: short): pinned word for word, one line each, no jargon. */
import { describe, expect, it } from 'vitest';
import * as T from './tipWords';
import { MORE_LESS, MORE_LESS_LABEL } from './layoutWords';
import { isWordingOnly } from './resultCodeHash';

describe('tip words', () => {
  it('Follow and Simulate, as Allan asked', () => {
    expect(T.TIP_FOLLOW).toBe('Set as active for My runs');
    expect(T.TIP_FOLLOWING).toBe('Active for My runs');
    expect(T.TIP_SIMULATE).toBe('Opens this route in the Auto Planner');
  });
  it('the run button and the three choices', () => {
    expect(T.TIP_RUN_FAST).toBe('Checks routes near the instant answer. You can stop and keep the best.');
    expect(T.TIP_RUN_EXACT).toBe('Wider than Fast: also tries one more and one fewer ascension. Slower.');
    expect(T.TIP_RUN_CUSTOM).toBe('Tries every route in your boxes, so it proves the best one. Can take hours.');
    expect(T.TIP_SEARCH_FAST).toBe('A quick check near the instant answer. Usually close to the best.');
    expect(T.TIP_SEARCH_EXACT).toBe('A slower, wider check, for a second opinion.');
    expect(T.TIP_SEARCH_CUSTOM).toBe('Every route in the boxes you set, to prove the best inside them.');
    expect(T.tipInfoLabel('Run Fast')).toBe('About Run Fast');
    expect([MORE_LESS, MORE_LESS_LABEL]).toEqual(['Less ⌃', 'Close More']);
  });
  it('one short line each: under 80 characters, one or two sentences, no jargon or names', () => {
    for (const v of Object.values(T)) {
      if (typeof v !== 'string') continue;
      expect(v.length, v).toBeLessThan(80);
      expect(v.split(/(?<=\.)\s/).length, v).toBeLessThanOrEqual(2);
      expect(v).not.toMatch(/simulator|collector|Joo|baseline/i);
    }
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/tipWords.ts')).toBe(true);
  });
});
