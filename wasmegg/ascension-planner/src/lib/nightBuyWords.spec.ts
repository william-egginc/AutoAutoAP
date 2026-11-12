/** The awake-hours note for a build-up plan (8 Nov 2026), pinned word for word. */
import { describe, expect, it } from 'vitest';
import { INSTANT_NIGHT_BUY_NOTE, INSTANT_NIGHT_BUY_TIP, NIGHT_BUY_NOTE, NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP } from './nightBuyWords';
import { isWordingOnly } from './resultCodeHash';

describe('night buy words', () => {
  it('the three lines', () => {
    expect(NIGHT_BUY_NOTE).toBe(
      "This plan's egg shifts don't wait for your awake hours, so it may buy research at night and the finish is a best case: it can be hours later."
    );
    expect(NIGHT_BUY_NOTE_SHORT).toBe("Shifts don't wait for your hours, so buys may fall at night and the finish is a best case.");
    expect(NIGHT_BUY_TIP).toBe(
      "This run's egg shifts don't wait for your awake hours, and neither do its research buys, so it may plan buys at night. Making them wait makes the finish later: on one save it was 3 h 44 min."
    );
    expect(INSTANT_NIGHT_BUY_NOTE).toBe("Quick estimate: it may buy research at night. After you press Follow, My runs shows exact times.");
    expect(INSTANT_NIGHT_BUY_TIP).toBe(
      "The instant answer is a quick estimate and does not hold its research buys to your awake hours, so it may buy at night. After you press Follow, My runs works out the exact times with the buys inside your hours. The finish there can be later: on one save it was 3 h 44 min."
    );
  });
  it('plain words: no simulator, no names', () => {
    for (const t of [NIGHT_BUY_NOTE, NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP, INSTANT_NIGHT_BUY_NOTE, INSTANT_NIGHT_BUY_TIP]) {
      expect(t).not.toMatch(/simulator|Joo|collector|table|baseline/i);
      expect(t).not.toMatch(/EI\d{16}/);
    }
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/nightBuyWords.ts')).toBe(true);
  });
});
