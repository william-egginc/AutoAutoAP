/**
 * The silo trick is a Setup setting, remembered per account with the others (spec-silotrick, 10 Nov 2026), off by default.
 * (It is not in the /prefs cloud value: that value is the collector's contract, which holds neither hold-shifts nor first
 * ascension; the setting stays on this device, like those.)
 */
import { describe, expect, it } from 'vitest';
import { isDefaultSetup, mergeSetup, parseSetup, sameSetup, setupDefaults } from '@/lib/setupMemory';
import { fingerprintRun, fingerprintSettings, settingsChanges } from '@/search/persistence';

describe('Setup memory: silo trick', () => {
  it('is off by default, and a blob without it reads as off', () => {
    expect(setupDefaults().siloTrick).toBe(false);
    expect(
      parseSetup(JSON.stringify({ v: 1, hours: { on: false, from: 7, to: 23, days: [] } }), '2026-11-10')?.siloTrick
    ).toBe(false);
  });

  it('is remembered when on, and makes the setup a non-default one', () => {
    const on = mergeSetup(setupDefaults(), { siloTrick: true }, 5);
    expect(parseSetup(JSON.stringify(on), '2026-11-10')?.siloTrick).toBe(true);
    expect(sameSetup(on, setupDefaults())).toBe(false);
    expect(isDefaultSetup(on)).toBe(false);
  });

  it('a bad value falls back to off', () => {
    expect(parseSetup(JSON.stringify({ v: 1, siloTrick: 'yes' }), '2026-11-10')?.siloTrick).toBe(false);
  });
});

describe('Run fingerprint: silo trick', () => {
  const base = { playerId: 'p', planStart: 1_790_000_000, currentTE: 197, final: 313 };
  it('is unchanged when off (every checkpoint written before still matches), different when on', () => {
    expect(fingerprintRun({ ...base, siloTrick: false })).toBe(fingerprintRun(base));
    expect(fingerprintRun({ ...base, siloTrick: true })).not.toBe(fingerprintRun(base));
  });

  it('is read back out, and a changed setting is named', () => {
    const on = fingerprintRun({ ...base, siloTrick: true });
    expect(fingerprintSettings(on)?.siloTrick).toBe(true);
    expect(fingerprintSettings(fingerprintRun(base))?.siloTrick).toBe(false);
    expect(settingsChanges(fingerprintRun(base), on)).toContain('the silo trick setting changed');
  });
});
