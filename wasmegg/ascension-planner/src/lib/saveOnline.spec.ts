/**
 * THE MASTER "SAVE ONLINE" SWITCH (Jordan, 7 Nov 2026; lib/saveOnline.ts): one per browser, ON by default (nothing
 * changes for anyone), kept in this browser's storage; off, the collector URL every saved-online module derives its
 * /follow, /prefs, /answers and /sync from is '' (`cloudSubmitUrl`), so nothing is read or written. Its default is
 * one constant, pinned here so that changing it is deliberate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_ONLINE_DEFAULT,
  SAVE_ONLINE_KEY,
  cloudSubmitUrl,
  resetSaveOnline,
  saveOnlineOn,
  saveOnlineSwitch,
  setSaveOnline,
} from './saveOnline';

let mem: Map<string, string>;
const SUBMIT = 'https://collector.example/submit';

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  resetSaveOnline();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSaveOnline();
});

describe('the default (one constant)', () => {
  it('Save online is ON by default (nothing changes for anyone)', () => {
    expect(SAVE_ONLINE_DEFAULT).toBe(true);
  });
});

describe('the switch', () => {
  it('nothing stored: on, and the collector URL passes through', () => {
    expect(saveOnlineOn()).toBe(true);
    expect(cloudSubmitUrl(SUBMIT)).toBe(SUBMIT);
    expect(cloudSubmitUrl(null)).toBe('');
  });
  it("off: kept in this browser ('0'), and the URL every saved-online module uses is ''", () => {
    setSaveOnline(false);
    expect(mem.get(SAVE_ONLINE_KEY)).toBe('0');
    expect(saveOnlineOn()).toBe(false);
    expect(cloudSubmitUrl(SUBMIT)).toBe('');
    // A new page load reads it back.
    resetSaveOnline();
    expect(saveOnlineOn()).toBe(false);
    setSaveOnline(true);
    expect(mem.get(SAVE_ONLINE_KEY)).toBe('1');
    expect(cloudSubmitUrl(SUBMIT)).toBe(SUBMIT);
  });
  it('the ref Setup binds is the same switch (v-model)', () => {
    const s = saveOnlineSwitch();
    s.value = false;
    expect(saveOnlineOn()).toBe(false);
    expect(mem.get(SAVE_ONLINE_KEY)).toBe('0');
  });
  it('storage that throws (a private window): the default for this visit, never a throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    resetSaveOnline();
    expect(saveOnlineOn()).toBe(SAVE_ONLINE_DEFAULT);
    expect(() => setSaveOnline(false)).not.toThrow();
    expect(saveOnlineOn()).toBe(false);
  });
  it('anything else stored counts as the default', () => {
    mem.set(SAVE_ONLINE_KEY, 'maybe');
    resetSaveOnline();
    expect(saveOnlineOn()).toBe(SAVE_ONLINE_DEFAULT);
  });
});
