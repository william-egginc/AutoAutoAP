/**
 * THE LONG-SEARCH ALERT HAS NO PLAYER SWITCH (Jordan, 16 Nov 2026: "don't give the users an option to disable the long
 * sends, just send a first signal and last (if possible); we will disable that once we stop updating things"). The
 * start still goes when a run of 2 hours or more begins, the stop when it ends (or 'closed' on pagehide). Setup has no
 * tick and no "Long searches: on/off" in its summary. A one-line code flag, RUN_BEACON_SENDS, turns it off for everyone
 * later. An "off" an older page stored in this browser no longer stops anything. The payload is unchanged.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RUN_BEACON_KEY,
  RUN_BEACON_SENDS,
  armLongRun,
  beaconEnabled,
  resetRunBeacon,
  runBeaconPageClosing,
  runBeaconRunEnded,
  runBeaconRunStarted,
} from './runBeacon';
import { sharingSummaryWords } from './layoutWords';

const SUBMIT = 'https://collector.example.workers.dev/submit';
let mem: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { onLine: true });
  resetRunBeacon();
});
afterEach(() => vi.unstubAllGlobals());

const sent = () => fetchMock.mock.calls.map(c => JSON.parse((c[1] as RequestInit).body as string));
const longRun = () => {
  armLongRun('exact', 3 * 3600);
  runBeaconRunStarted(SUBMIT);
};

describe('the one-line flag', () => {
  it('is on, is the gate, and is one line', () => {
    expect(RUN_BEACON_SENDS).toBe(true);
    expect(beaconEnabled()).toBe(RUN_BEACON_SENDS);
    expect(readFileSync(new URL('./runBeacon.ts', import.meta.url), 'utf8')).toMatch(/^export const RUN_BEACON_SENDS = true;$/m);
  });
});

describe('an old "off" in this browser stops nothing', () => {
  it.each(['0', 'off', 'false'])('stored %j: the start, the stop and the closing send all go', value => {
    mem.set(RUN_BEACON_KEY, value);
    resetRunBeacon();
    longRun();
    runBeaconRunEnded('finished');
    longRun();
    runBeaconPageClosing();
    expect(sent().map(b => b.t)).toEqual(['start', 'stop', 'start', 'stop']);
    expect(sent()[3].reason).toBe('closed');
  });

  it('the payload is unchanged: run code, kind, estHours, build, startedAt (reason on the stop); nothing else', () => {
    mem.set(RUN_BEACON_KEY, '0');
    longRun();
    runBeaconRunEnded('stopped');
    const [start, stop] = sent();
    expect(Object.keys(start).sort()).toEqual(['build', 'estHours', 'kind', 'run', 'startedAt', 't']);
    expect(Object.keys(stop).sort()).toEqual(['reason', 'run', 't']);
    expect(stop.reason).toBe('cancelled');
  });

  it('nothing reads or writes the old key any more', () => {
    mem.set(RUN_BEACON_KEY, '0');
    const writes = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => '0', setItem: writes, removeItem: writes });
    longRun();
    expect(writes).not.toHaveBeenCalled();
  });
});

describe('no switch for the player', () => {
  it('the library exports none', async () => {
    const lib = await import('./runBeacon');
    expect('runBeaconSwitch' in lib).toBe(false);
    expect('RUN_BEACON_DEFAULT' in lib).toBe(false);
  });

  it("Setup has no tick and the summary line has no 'Long searches'", () => {
    const setup = readFileSync(new URL('../components/auto/YourSetup.vue', import.meta.url), 'utf8');
    expect(setup).not.toContain('data-testid="run-beacon"');
    expect(setup).not.toContain('runBeaconSwitch');
    expect(setup).not.toContain('BEACON_SETUP_LABEL');
    expect(setup).not.toContain('BEACON_SETUP_OFF');
    // One plain line says it, with no checkbox.
    expect(setup).toContain('{{ BEACON_SETUP_LINE }}');
    const at = setup.indexOf('data-testid="run-beacon-line"');
    expect(setup.slice(setup.lastIndexOf('\n', at), at + 120)).not.toContain('type="checkbox"');
    expect(sharingSummaryWords({ help: 'no', saveOnline: true })).toBe('Help improve: no thanks · Save online: on');
    expect(sharingSummaryWords({ help: 'yes', saveOnline: false, searchResults: true, instantWithRuns: false })).not.toContain('Long searches');
  });
});
