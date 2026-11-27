/** Weekly hours (R10) survive carrying on a run and putting a saved answer's settings back: the run fingerprint's
 *  `availw-<hex>@zone` key reads back to the same mask (persistence.ts fingerprintSettings), and both restorers in the
 *  store put `blockedHours` back (before this, a carry-on turned the hours off and a saved answer kept the current mask). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprintRun, fingerprintSettings } from './persistence';
import { availabilityKey, maskOfWindow, weekIndex, type Availability } from './availabilitySchedule';

const WORK = [1, 2, 3, 4, 5].flatMap(d => [9, 10, 11, 12, 13, 14, 15, 16].map(h => weekIndex(d, h)));
const SLEEP_WORK = [...new Set([...maskOfWindow([], 7, 23), ...WORK])].sort((a, b) => a - b);
const run = (availability: Availability, deferShifts = true) =>
  fingerprintRun({ playerId: 'EI1234567890123456', planStart: 1795000000, currentTE: 120, final: 490, availability, deferShifts });

describe('the run fingerprint keeps the week', () => {
  it('a custom week reads back to the same mask, zone and held shifts, and keys the same', () => {
    const a: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver', blocked: SLEEP_WORK };
    for (const defer of [true, false]) {
      const back = fingerprintSettings(run(a, defer))!;
      expect(back.availability?.blocked).toEqual(SLEEP_WORK);
      expect(back.availability?.timezone).toBe('America/Denver');
      expect(back.deferShifts).toBe(defer);
      expect(availabilityKey(back.availability)).toBe(availabilityKey(a));
      expect(run(back.availability!, defer)).toBe(run(a, defer));
    }
  });
  it('a mask that is its own window still writes and reads the old key (no blocked comes back)', () => {
    const a: Availability = { days: [1, 2], fromHour: 18, toHour: 23, timezone: 'UTC', blocked: maskOfWindow([1, 2], 18, 23) };
    const back = fingerprintSettings(run(a))!;
    expect(back.availability).toEqual({ days: [1, 2], fromHour: 18, toHour: 23, timezone: 'UTC' });
  });
});

describe('the store puts the week back', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../stores/chainSearch.ts'), 'utf8');
  const body = (name: string) => {
    const i = src.indexOf(`function ${name}(`);
    return src.slice(i, src.indexOf('\n  }\n', i));
  };
  for (const name of ['applyRunSettingsNow', 'applyStoredSettingsNow'])
    it(`${name} sets blockedHours from the settings (and clears it when they carry none)`, () => {
      expect(body(name)).toMatch(/blockedHours\.value = set\.availability\.blocked \? validBlocked\(set\.availability\.blocked\) : null;/);
    });
});
