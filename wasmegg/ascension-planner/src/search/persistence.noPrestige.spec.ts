/** No prestige on these days in the run fingerprint (search/persistence.ts): only when set, read back, and named. */
import { describe, expect, it } from 'vitest';
import { fingerprintChanges, fingerprintRun, fingerprintSettings } from './persistence';

const base = { playerId: 'EI1234567890123456', planStart: 1_800_000_000, currentTE: 190, final: 490 };

describe('the no-prestige days in the run fingerprint', () => {
  it('absent when none, so every fingerprint written before still matches', () => {
    expect(fingerprintRun({ ...base, noPrestige: [] })).toBe(fingerprintRun(base));
  });
  it('read back out, and a change is named in the player’s words', () => {
    const fp = fingerprintRun({ ...base, noPrestige: [{ from: 1_800_100_000, to: 1_800_186_400 }] });
    expect(fp).toContain('|np:1800100000-1800186400');
    expect(fingerprintSettings(fp)!.noPrestige).toEqual([{ from: 1_800_100_000, to: 1_800_186_400 }]);
    expect(fingerprintSettings(fp)!.availability).toBeNull();
    expect(fingerprintChanges(fp, fingerprintRun(base))).toEqual(['the no-prestige days changed']);
  });
  it('kept apart from time off', () => {
    const off = [{ from: 1_800_100_000, to: 1_800_186_400 }];
    expect(fingerprintRun({ ...base, timeOff: off })).not.toBe(fingerprintRun({ ...base, noPrestige: off }));
  });
});
