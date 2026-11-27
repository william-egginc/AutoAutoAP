/** The Silo trick setting's words (10 Nov 2026), pinned word for word and checked for plainness. */
import { describe, expect, it } from 'vitest';
import { SILO_TRICK_HELP, SILO_TRICK_LABEL, SILO_TRICK_NOT_COUNTED } from './siloTrickWords';
import { isWordingOnly } from './resultCodeHash';

describe('silo trick words', () => {
  it('the label, the help and the tracker hint', () => {
    expect(SILO_TRICK_LABEL).toBe('Silo trick');
    expect(SILO_TRICK_HELP).toBe(
      "Go offline after Sunday's check-in and collect inside Monday's 2x Earnings event: the time away is paid at 2x, up to what your silos hold. On, the plan counts that cash. Off, it does not, so it may plan fewer buys than you can afford. On assumes you do it every week."
    );
    expect(SILO_TRICK_NOT_COUNTED).toBe('This plan does not count the cash from the silo trick. Turn on Silo trick in Setup to count it.');
  });
  it('plain: no simulator or project words, no numbers from one save, short sentences', () => {
    for (const t of [SILO_TRICK_HELP, SILO_TRICK_NOT_COUNTED]) {
      expect(t).not.toMatch(/simulator|collector|Joo|TrackerResult/i);
      expect(t).not.toMatch(/\d{2}/);
      expect(t.split(/(?<=\.)\s/).every(s => s.length < 150)).toBe(true);
    }
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/siloTrickWords.ts')).toBe(true);
  });
});
