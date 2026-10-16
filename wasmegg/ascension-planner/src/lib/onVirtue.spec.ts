/** Already on virtue (lib/onVirtue.ts): hides "When should I start?" for a player already ascending. */
import { describe, expect, it } from 'vitest';
import { offerStartTimes, saveOnVirtue } from './onVirtue';

describe('saveOnVirtue', () => {
  it('a save with a farm on a virtue egg (50 to 54) is on virtue', () => {
    for (const egg of [50, 52, 54]) {
      const save = { farms: [{ eggType: 1 }, { eggType: egg }] };
      expect(saveOnVirtue(save)).toBe(true);
      expect(offerStartTimes(save)).toBe(false);
    }
  });

  it('a save on the home farm or a contract (no virtue farm) is not, whatever its TE', () => {
    const home = { farms: [{ eggType: 18 }, { eggType: 200 }], virtue: { eovEarned: [40, 40, 40, 40, 40] } };
    expect(saveOnVirtue(home)).toBe(false);
    expect(offerStartTimes(home)).toBe(true);
    expect(saveOnVirtue({ farms: [] })).toBe(false);
    expect(saveOnVirtue({})).toBe(false);
    // Eggs either side of the virtue range, and junk, don't count.
    expect(saveOnVirtue({ farms: [{ eggType: 49 }, { eggType: 55 }, null, { eggType: '50' }] })).toBe(false);
  });

  it('no save loaded: unknown, and the page shows', () => {
    expect(saveOnVirtue(null)).toBeNull();
    expect(saveOnVirtue(undefined)).toBeNull();
    expect(offerStartTimes(null)).toBe(true);
  });
});
