/** The Setup line next to the worker count when Safari starts a run with fewer workers than were chosen (Words, 15 Nov 2026). */
import { describe, expect, it } from 'vitest';
import { safariStartWords } from './safariStartWords';

describe('safariStartWords', () => {
  it('says how many workers, how many were chosen, why, that results do not change, and how to override', () => {
    expect(safariStartWords({ workers: 5, chosen: 7 })).toBe(
      'Safari starts runs with 5 workers, not the 7 you chose, because it has stopped runs that used more. Results are the same; only the time changes. Pick a number here to use it for this visit.'
    );
  });
  it('one worker is singular', () => {
    expect(safariStartWords({ workers: 1, chosen: 3 })).toContain('starts runs with 1 worker, not the 3 you chose');
  });
  it('nothing to say (null, or the same number) is no line', () => {
    expect(safariStartWords(null)).toBe('');
    expect(safariStartWords({ workers: 5, chosen: 5 })).toBe('');
  });
  it('no EI id, no Click or Tap', () => {
    const t = safariStartWords({ workers: 5, chosen: 7 });
    expect(t).not.toMatch(/\b(click|tap)\b/i);
    expect(t).not.toMatch(/EI\d{16}/);
  });
});
