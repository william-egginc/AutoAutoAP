/**
 * The starting-TE override saved online (composables/useOverrideSync.ts), Reliability's review of spec-syncclient-a
 * (7 Nov 2026): a change still waiting when the account is switched goes under its own account's key (as stores/prefs.ts
 * does), a record weighed while a search runs never changes the starting TE under it, and a PUT under way when Save
 * online goes off is not sent again ("ahead"). Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { getThresholdForTE } from '@/lib/truthEggs';
import { saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';
import { syncTEOverrideToAccount } from '@/lib/teOverrideAccount';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { resetSaveOnline, setSaveOnline } from '@/lib/saveOnline';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';
import { useForgetEverything } from '@/composables/useForgetEverything';
import {
  OVERRIDE_SYNC_DEBOUNCE_MS,
  cloudOverrideOffer,
  flushOverrideSync,
  noteTEOverrideChange,
  resetOverrideSync,
  syncOverrideFromCloud,
  useOverrideSync,
} from './useOverrideSync';

const applyAutoStartingTE = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/auto/startingTE', async orig => ({ ...(await orig<typeof import('@/auto/startingTE')>()), applyAutoStartingTE }));

const ID = 'EI0000000000000000';
const OTHER_ID = 'EI0000000000000001';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const T0 = Date.UTC(2026, 10, 7, 18);
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
const TE198 = { ...TE197, kindness: 38 };
const raw = (id = ID) => ({ eiUserId: id, virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, getThresholdForTE(38)] } });

let c: FakeSyncCollector;
const running = ref(false);

function browser() {
  const mem = new Map<string, string>();
  async function load() {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: () => null,
      length: 0,
    });
    vi.stubGlobal('fetch', c.f);
    resetSaveOnline();
    resetOverrideSync();
    setActivePinia(createPinia());
    defineStore('chainSearch', () => ({ submitUrl: c.submitUrl, availability: null, busy: false, sweepQueue: { at: -1 }, isRunning: running }))();
    const s = useInitialStateStore();
    s.playerId = ID;
    s.rawBackup = raw() as never;
    s.lastBackupTime = Math.floor(T0 / 1000);
    syncTEOverrideToAccount();
    await vi.waitFor(() => expect(useFollowStore().cloudKey).toBe(KEY));
    await syncOverrideFromCloud();
    return useAutoPlannerStore();
  }
  function type(te: Record<string, number> | null, id = ID) {
    const p = useAutoPlannerStore();
    p.teOverride = te as never;
    saveAutoPlannerTEInputs(id, te ? { teEarned: { ...te } as never } : null);
    noteTEOverrideChange(id, te as never);
  }
  return { mem, load, type };
}

const syncPuts = () => c.calls.filter(x => x.method === 'PUT' && x.url.includes('/sync'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  SYNC_RECORDS.enabled = true;
  running.value = false;
  applyAutoStartingTE.mockClear();
  for (const m of ['log', 'info', 'warn', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const call of c.calls) {
    expect(call.url).not.toMatch(/EI\d{16}/i);
    if (call.body) expect(call.body).not.toMatch(/EI\d{16}/i);
  }
  SYNC_RECORDS.enabled = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('account switch', () => {
  it('a change still waiting when another account loads goes, under its own key', async () => {
    const A = browser();
    await A.load();
    A.type(TE197);
    const at = Date.now();
    // Another account's save loads before the 2 s are up: the followed routes' key moves on.
    const s = useInitialStateStore();
    s.playerId = OTHER_ID;
    s.rawBackup = raw(OTHER_ID) as never;
    await vi.waitFor(() => expect(useFollowStore().cloudKey).not.toBe(KEY));
    await vi.advanceTimersByTimeAsync(OVERRIDE_SYNC_DEBOUNCE_MS);
    expect(syncPuts()).toHaveLength(1);
    expect(c.record(KEY, 'override')).toEqual({ at, value: { ...TE197, saveTE: 198 } });
  });
});

describe('while a search runs', () => {
  it("another device's override is not put in place under it; the next read after it does", async () => {
    const A = browser();
    const B = browser();
    await A.load();
    // Equal to the save's TE: applied without the question (resolveOverride `adopt`).
    A.type(TE198);
    await flushOverrideSync();
    running.value = true;
    const p = await B.load();
    expect(p.teOverride).toBeNull();
    expect(applyAutoStartingTE).not.toHaveBeenCalled();
    // App.vue's useOverrideSync reads again once the search ends.
    useOverrideSync();
    running.value = false;
    await vi.waitFor(() => expect(p.teOverride).toEqual(TE198));
    expect(applyAutoStartingTE).toHaveBeenCalled();
    expect(cloudOverrideOffer()).toBeNull();
  });
});

describe('Save online off', () => {
  it('a PUT refused as "ahead" is not sent again after the switch went off', async () => {
    const A = browser();
    await A.load();
    // Typed while this device's clock was 20 minutes fast.
    vi.setSystemTime(T0 + 20 * 60_000);
    A.type(TE197);
    vi.setSystemTime(T0);
    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') setSaveOnline(false);
      return c.f(url, init as never);
    });
    await flushOverrideSync();
    expect(syncPuts()).toHaveLength(1);
  });
});

describe('Delete everything saved online', () => {
  // DESIGN (left to UI / Jordan): the switch goes off only once /forget has answered, so a change whose 2 s end while
  // the DELETE is out (here the starting TE; a Setup change or an answer the same) is written straight back after the
  // delete. One way: turn Save online off before sending /forget and back on if it fails. Flip to `it` once fixed.
  it.fails('a change waiting while the DELETE is out is not written back', async () => {
    const A = browser();
    await A.load();
    A.type(TE197);
    let answer: (() => void) | null = null;
    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      const r = c.f(url, init as never);
      return init?.method === 'DELETE' ? new Promise(res => (answer = () => res(r))) : r;
    });
    const d = useForgetEverything();
    const done = d.confirm();
    await vi.advanceTimersByTimeAsync(OVERRIDE_SYNC_DEBOUNCE_MS);
    (answer as (() => void) | null)?.();
    await done;
    expect(d.phase.value).toBe('done');
    expect(c.record(KEY, 'override')).toBeUndefined();
  });
});
