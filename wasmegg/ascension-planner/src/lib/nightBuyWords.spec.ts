/** The awake-hours note for a build-up plan (8 Nov 2026), pinned word for word. */
import { describe, expect, it } from 'vitest';
import { NIGHT_BUY_NOTE, NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP } from './nightBuyWords';
import { isWordingOnly } from './resultCodeHash';

describe('night buy words', () => {
  it('the three lines', () => {
    expect(NIGHT_BUY_NOTE).toBe(
      'With awake hours on, this plan may buy research at night, outside your hours, so the finish is a best case: it can be hours later.'
    );
    expect(NIGHT_BUY_NOTE_SHORT).toBe('Buys may fall outside your awake hours, so the finish is a best case.');
    expect(NIGHT_BUY_TIP).toBe(
      'A build-up plan keeps shifts and prestiges inside your awake hours but not its research buys, so it may plan buys at night. Doing them in your own hours makes the finish later: on one save it was 3 h 44 min.'
    );
  });
  it('plain words: no simulator, no names', () => {
    for (const t of [NIGHT_BUY_NOTE, NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP]) {
      expect(t).not.toMatch(/simulator|Joo|collector/i);
      expect(t).not.toMatch(/EI\d{16}/);
    }
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/nightBuyWords.ts')).toBe(true);
  });
});
