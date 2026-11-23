/** lib/trackerAscension.ts (code review round 2, 22 Nov 2026, R7.5). */
import { describe, expect, it } from 'vitest';
import { inFirstAscension, keptAscensionStart } from './trackerAscension';

const kept = { ascensionStart: 1000, saveSeconds: 5000, resets: 7, firstStop: 226 };
const now = { resets: 7, firstStop: 226, first: true };

describe('keptAscensionStart', () => {
  it('the kept key while the count, the first stop and the save order match, in the first ascension', () => {
    expect(keptAscensionStart(kept, now, 6000)).toBe(1000);
    expect(keptAscensionStart(kept, now, 5000)).toBe(1000);
  });
  it('none for an older save, another count, another first stop, a later ascension, or a plan kept before', () => {
    expect(keptAscensionStart(kept, now, 4999)).toBeNull();
    expect(keptAscensionStart(kept, { ...now, resets: 8 }, 6000)).toBeNull();
    expect(keptAscensionStart(kept, { ...now, firstStop: 222 }, 6000)).toBeNull();
    expect(keptAscensionStart(kept, { ...now, first: false }, 6000)).toBeNull();
    expect(keptAscensionStart({ ascensionStart: 1000, saveSeconds: 5000 }, now, 6000)).toBeNull();
    expect(keptAscensionStart(kept, { ...now, resets: null }, 6000)).toBeNull();
    expect(keptAscensionStart(null, now, 6000)).toBeNull();
  });
});

describe('inFirstAscension', () => {
  const plan = { chain: [226, 277], legs: [{ endTime: 100 }, { endTime: 200 }] };
  it('before the first stop is reached: the first; after: not', () => {
    expect(inFirstAscension(plan, 50)).toBe(true);
    expect(inFirstAscension(plan, 150)).toBe(false);
    expect(inFirstAscension(plan, 250)).toBe(false);
    expect(inFirstAscension(null, 50)).toBe(false);
    expect(inFirstAscension({ chain: [226], legs: null, tableLegs: [{ end: 100 }] }, 50)).toBe(true);
  });
});
