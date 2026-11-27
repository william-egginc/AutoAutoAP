/** spec-stuck3: the breadcrumb naming which part of My Runs' simulation request changed (lib/simKeyChange.ts). */
import { describe, expect, it } from 'vitest';
import { simKeyChange } from './simKeyChange';
import { simSetupKey } from './followSim';

const setup = (firstAscension: string, timeOff: unknown[] = []) =>
  simSetupKey({ availability: null, useHours: false, timeOff, noPrestige: [], firstAscension, deferShifts: false });
const base = { account: 'acct-hash', backupTime: 1_790_000_000, route: [221, 246], setup: setup('buildup') };

describe('which part of the request changed', () => {
  it('names the setup part, the route and the save time, never the account itself', () => {
    expect(simKeyChange(base, { ...base, setup: setup('continue') })).toBe('setup: first ascension');
    expect(simKeyChange(base, { ...base, setup: setup('buildup', [{ from: 1, to: 2 }]) })).toBe('setup: time off');
    expect(simKeyChange(base, { ...base, route: [246, 280] })).toBe('route 221,246 -> 246,280');
    expect(simKeyChange(base, { ...base, backupTime: 1_790_000_060, account: 'other-hash' })).toBe(
      'account; save time 1790000000 -> 1790000060'
    );
    expect(simKeyChange(base, { ...base })).toBe('nothing');
  });

  it('names the silo trick and the zone (code review round 2, 22 Nov 2026, R7.3)', () => {
    const o = { availability: null, useHours: false, timeOff: [], noPrestige: [], firstAscension: 'buildup', deferShifts: false };
    const was = { ...base, setup: simSetupKey({ ...o, zone: 'America/Denver' }) };
    expect(simKeyChange(was, { ...base, setup: simSetupKey({ ...o, zone: 'America/Denver', siloTrick: true }) })).toBe('setup: silo trick');
    expect(simKeyChange(was, { ...base, setup: simSetupKey({ ...o, zone: 'America/New_York' }) })).toBe('setup: zone');
  });
});
