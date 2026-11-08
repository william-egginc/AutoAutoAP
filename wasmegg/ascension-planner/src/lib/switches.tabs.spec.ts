/**
 * QA review 7 Nov 2026, finding 1 (HIGH) and 8: the Save online switch (lib/saveOnline.ts) and the run alert's switch
 * (lib/runBeacon.ts) were read once per page, so turning one off (or Delete everything, which turns Save online off)
 * in one tab left the other tabs saving online / announcing runs. Each now follows the `storage` event of its key.
 *
 * Two tabs here: one shared storage, and this page's `window` (an EventTarget) receiving the `storage` event a browser
 * dispatches in the OTHER tabs when one tab writes (a browser never sends it to the tab that wrote). The repo's vitest
 * environment is 'node' with no jsdom or happy-dom, so the event is a plain Event carrying StorageEvent's fields.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_ONLINE_KEY, cloudSubmitUrl, resetSaveOnline, saveOnlineOn, saveOnlineSwitch } from './saveOnline';
import { RUN_BEACON_KEY, armLongRun, beaconEnabled, resetRunBeacon, runBeaconRunStarted, runBeaconSwitch } from './runBeacon';

let mem: Map<string, string>;
let ls: Storage;
let win: EventTarget;

/** Another tab wrote `key`: the shared storage changes, then this tab gets the event. */
function otherTabWrites(key: string, value: string | null): void {
  if (value === null) mem.delete(key);
  else mem.set(key, value);
  win.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: value, storageArea: ls }));
}

beforeEach(() => {
  mem = new Map();
  ls = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  } as unknown as Storage;
  win = new EventTarget();
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', win);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  resetSaveOnline();
  resetRunBeacon();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSaveOnline();
  resetRunBeacon();
});

describe('Save online follows the other tabs', () => {
  it('turned off in another tab: off here at once, and the collector URL is gone', () => {
    mem.set(SAVE_ONLINE_KEY, '1');
    saveOnlineSwitch();
    expect(saveOnlineOn()).toBe(true);
    otherTabWrites(SAVE_ONLINE_KEY, '0');
    expect(saveOnlineOn()).toBe(false);
    expect(cloudSubmitUrl('https://x.example/submit')).toBe('');
    otherTabWrites(SAVE_ONLINE_KEY, '1');
    expect(saveOnlineOn()).toBe(true);
  });
  it("another key, another storage, or the key cleared: the key's own value, nothing else", () => {
    saveOnlineSwitch();
    otherTabWrites('aap.other', '0');
    expect(saveOnlineOn()).toBe(true);
    win.dispatchEvent(Object.assign(new Event('storage'), { key: SAVE_ONLINE_KEY, newValue: '0', storageArea: {} }));
    expect(saveOnlineOn()).toBe(true);
    mem.set(SAVE_ONLINE_KEY, '0');
    win.dispatchEvent(Object.assign(new Event('storage'), { key: null, newValue: null, storageArea: ls }));
    expect(saveOnlineOn()).toBe(false);
  });
});

describe('the run alert switch follows the other tabs', () => {
  it('turned off in another tab: a long run started here sends nothing', () => {
    runBeaconSwitch();
    otherTabWrites(RUN_BEACON_KEY, '0');
    expect(beaconEnabled()).toBe(false);
    armLongRun('fast', 3 * 3600);
    runBeaconRunStarted('https://x.example/submit');
    expect(fetch).not.toHaveBeenCalled();
    // Taking it in writes nothing back.
    expect(mem.get(RUN_BEACON_KEY)).toBe('0');
  });
});
