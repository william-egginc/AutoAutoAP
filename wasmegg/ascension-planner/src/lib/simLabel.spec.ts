import { describe, expect, it } from 'vitest';
import { FIRST_STAMP_DAY, KNOWN_SIMS, simDate, simLabel } from './simLabel';

const LOWTE = '2026-10-13-lowte-gate';
const BETA2 = '2026-10-21-egg-beta2';

describe('simLabel', () => {
  it('the same stamp as the site is "current"', () => {
    expect(simLabel(LOWTE, LOWTE)).toMatchObject({ kind: 'current', words: 'current', stamp: LOWTE });
    expect(simLabel(BETA2, BETA2).kind).toBe('current');
  });

  it('a known earlier stamp is "older simulator", with the stamp in its hover text', () => {
    const l = simLabel(LOWTE, BETA2);
    expect(l).toMatchObject({ kind: 'older', words: 'older simulator', stamp: LOWTE });
    expect(l.title).toContain(LOWTE);
    expect(l.title).toContain(BETA2);
  });

  it('a later stamp (a site behind the board) is "newer simulator"', () => {
    expect(simLabel(BETA2, LOWTE)).toMatchObject({ kind: 'newer', words: 'newer simulator' });
  });

  it('no stamp is "unknown (before Oct 13)"', () => {
    for (const s of [undefined, null, '', '  ', 7]) {
      expect(simLabel(s, LOWTE)).toMatchObject({ kind: 'unknown', words: 'unknown (before Oct 13)', stamp: null });
    }
  });

  it('a stamp missing from the list is placed by its date; one with no date is "other simulator"', () => {
    expect(simLabel('2026-10-01-x', LOWTE).kind).toBe('older');
    expect(simLabel('2026-11-30-y', LOWTE).kind).toBe('newer');
    expect(simLabel('mystery', LOWTE)).toMatchObject({ kind: 'other', words: 'other simulator', stamp: 'mystery' });
  });

  it('the known stamps are a short dated table, and "Oct 13" comes from its first day', () => {
    expect(KNOWN_SIMS.map(k => k.stamp)).toEqual([LOWTE, BETA2]);
    for (const k of KNOWN_SIMS) expect(k.stamp.startsWith(k.date)).toBe(true);
    expect(FIRST_STAMP_DAY).toBe('Oct 13');
    expect(simDate(BETA2)).toBe('2026-10-21');
  });
});
