import { describe, expect, it } from 'vitest';
import { CLOTHED_TE_TIP, playerLine } from './playerLineWords';

describe('the player line', () => {
  it('name, claimed, pending, Clothed TE', () => {
    expect(playerLine({ name: 'Williamthe5thc', claimed: 197, pending: 2, clothed: 328 })).toBe('Williamthe5thc · 197 claimed TE · 2 pending · 328 Clothed TE');
  });
  it('leaves out what is not there: no pending, no name, no Clothed TE', () => {
    expect(playerLine({ name: 'Carpet', claimed: 197, pending: 0, clothed: 328 })).toBe('Carpet · 197 claimed TE · 328 Clothed TE');
    expect(playerLine({ claimed: 197, pending: null, clothed: null })).toBe('197 claimed TE');
  });
  it('short: CTE, with its tip', () => {
    expect(playerLine({ claimed: 197, clothed: 328.4, short: true })).toBe('197 claimed TE · 328 CTE');
    expect(CLOTHED_TE_TIP).toMatch(/^CTE is Clothed TE/);
  });
});
