/**
 * The starting-TE override saved online (client brief sections 1, 3 "Override" and 5; composables/useOverrideSync.ts):
 * two simulated browsers on one account against one fake collector (src/test/fakeSyncCollector.ts).
 *
 *  - WRITE only from the player's actions (Virtue Progress's add / edit / remove, the banner's buttons), 2 s after the
 *    last edit, stamped with the time of the action; removing writes the tombstone { removed: true }. The local value
 *    gains `at` and `saveTE` beside the five numbers (a v2 value without `at` counts as 0).
 *  - READ when the account is set up: the list, then the record when newer than this browser's.
 *  - NEVER SILENTLY: another device's different override is ASKED ("Another device set a starting TE of N. Your save
 *    says M."), applied only by Use it; Use my save's TE removes it everywhere. Equal to the save's TE, the same as this
 *    device's, or confirmed here before: applied without the question. A newer tombstone removes it here.
 *  - 404 (an older collector) turns it off for the page quietly; 429 waits retryAfter; 409 takes the newer record.
 *  - Save online off, or SYNC_RECORDS off: nothing read or written. No payload holds an ID.
 * Placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { accountOf } from '@/search/runSaves';
import { getThresholdForTE } from '@/lib/truthEggs';
import { loadAutoPlannerTEOverride, saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';
import { syncTEOverrideToAccount } from '@/lib/teOverrideAccount';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { resetSaveOnline, setSaveOnline } from '@/lib/saveOnline';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';
import {
  OVERRIDE_SYNC_DEBOUNCE_MS,
  TE_INPUTS_V2_PREFIX,
  cloudOverrideOffer,
  flushOverrideSync,
  noteTEOverrideChange,
  readLocalOverride,
  rejectCloudOverride,
  resetOverrideSync,
  syncOverrideFromCloud,
  useCloudOverride,
} from './useOverrideSync';

const applyAutoStartingTE = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/auto/startingTE', async orig => ({ ...(await orig<typeof import('@/auto/startingTE')>()), applyAutoStartingTE }));

const ID = 'EI0000000000000000';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const T0 = Date.UTC(2026, 10, 7, 18);
/** 197 claimed and one passed not claimed: the save says 198. */
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
const TE198 = { ...TE197, kindness: 38 };
const raw = () => ({ eiUserId: ID, virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, getThresholdForTE(38)] } });

let c: FakeSyncCollector;

/** One browser: its own storage; `load` is a page load that sets the account up as the Auto Planner does. */
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
    defineStore('chainSearch', () => ({ submitUrl: c.submitUrl, availability: null, busy: false, sweepQueue: { at: -1 } }))();
    const s = useInitialStateStore();
    s.playerId = ID;
    s.rawBackup = raw() as never;
    s.lastBackupTime = Math.floor(T0 / 1000);
    // lib/modes/planFuture.ts 4b: this account's override from this browser's cache.
    syncTEOverrideToAccount();
    await vi.waitFor(() => expect(useFollowStore().cloudKey).toBe(KEY));
    await syncOverrideFromCloud();
    return useAutoPlannerStore();
  }
  /** Virtue Progress's add / edit (VirtueProgressSection.vue: the store, then cacheTEOverride). */
  function type(te: Record<string, number> | null) {
    const p = useAutoPlannerStore();
    p.teOverride = te as never;
    saveAutoPlannerTEInputs(ID, te ? { teEarned: { ...te } as never } : null);
    noteTEOverrideChange(ID, te as never);
  }
  return { mem, load, type };
}

const syncPuts = () => c.calls.filter(x => x.method === 'PUT' && x.url.includes('/sync'));
const syncCalls = () => c.calls.filter(x => x.url.includes('/sync'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  SYNC_RECORDS.enabled = true;
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

describe('the local value', () => {
  it('{ teEarned, at, saveTE } in the same v2 key; the hashed cache still reads it; no at counts as 0', async () => {
    const A = browser();
    await A.load();
    const at = Date.now();
    A.type(TE197);
    const v = JSON.parse(A.mem.get(`${TE_INPUTS_V2_PREFIX}:${ID}`)!);
    expect(v).toEqual({ teEarned: TE197, at, saveTE: 198 });
    expect(loadAutoPlannerTEOverride(ID)).toEqual(TE197);
    A.mem.set(`${TE_INPUTS_V2_PREFIX}:${ID}`, JSON.stringify({ teEarned: TE197 }));
    expect(readLocalOverride(ID)).toEqual({ teEarned: TE197, at: 0, removedAt: 0 });
  });
});

describe('writing', () => {
  it('one PUT 2 s after the last edit, stamped with the edit; removing writes the tombstone', async () => {
    const A = browser();
    await A.load();
    A.type({ ...TE197, kindness: 36 });
    vi.advanceTimersByTime(500);
    A.type(TE197);
    const at = Date.now();
    await vi.advanceTimersByTimeAsync(OVERRIDE_SYNC_DEBOUNCE_MS - 1);
    expect(syncPuts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncPuts()).toHaveLength(1);
    expect(syncPuts()[0].url).toBe(`https://collector.example/sync?k=${KEY}&kind=override&slot=0&at=${at}`);
    expect(c.record(KEY, 'override')).toEqual({ at, value: { ...TE197, saveTE: 198 } });
    vi.advanceTimersByTime(60_000);
    A.type(null);
    await flushOverrideSync();
    expect(c.record(KEY, 'override')).toEqual({ at: Date.now(), value: { removed: true } });
  });

  it('a load writes nothing (never from a watcher)', async () => {
    const A = browser();
    A.mem.set(`${TE_INPUTS_V2_PREFIX}:${ID}`, JSON.stringify({ teEarned: TE197, at: T0 - 1000, saveTE: 198 }));
    await A.load();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPuts()).toEqual([]);
  });
});

describe('two browsers', () => {
  it('A types 197; B (none) is ASKED, not applied; Use it applies it, and B is not asked again for it', async () => {
    const A = browser();
    const B = browser();
    await A.load();
    const at = Date.now();
    A.type(TE197);
    await flushOverrideSync();
    const p = await B.load();
    expect(p.teOverride).toBeNull();
    expect(cloudOverrideOffer()).toEqual({ account: accountOf(raw()), teEarned: TE197, at, saveTE: 198, typed: 197, saveNow: 198 });
    expect(loadAutoPlannerTEOverride(ID)).toBeNull();
    await useCloudOverride();
    expect(p.teOverride).toEqual(TE197);
    expect(applyAutoStartingTE).toHaveBeenCalled();
    expect(cloudOverrideOffer()).toBeNull();
    expect(readLocalOverride(ID)).toEqual({ teEarned: TE197, at, saveTE: 198, removedAt: 0 });
    // Taking it writes nothing back.
    expect(syncPuts()).toHaveLength(1);
  });

  it("B has its own different override: asked, B's stays in effect until answered", async () => {
    const A = browser();
    const B = browser();
    await B.load();
    B.type(TE198);
    await flushOverrideSync();
    vi.advanceTimersByTime(60_000);
    await A.load();
    A.type(TE197);
    await flushOverrideSync();
    const p = await B.load();
    expect(p.teOverride).toEqual(TE198);
    expect(cloudOverrideOffer()).toMatchObject({ teEarned: TE197, typed: 197, saveNow: 198 });
  });

  it("Use my save's TE on the question removes it everywhere (a tombstone), here too", async () => {
    const A = browser();
    const B = browser();
    await A.load();
    A.type(TE197);
    await flushOverrideSync();
    vi.advanceTimersByTime(60_000);
    const p = await B.load();
    const at = Date.now();
    await rejectCloudOverride();
    await flushOverrideSync();
    expect(p.teOverride).toBeNull();
    expect(c.record(KEY, 'override')).toEqual({ at, value: { removed: true } });
    expect(cloudOverrideOffer()).toBeNull();
    // A, on its next load, loses the override (a newer tombstone), with no question.
    const pa = await A.load();
    expect(pa.teOverride).toBeNull();
    expect(loadAutoPlannerTEOverride(ID)).toBeNull();
    expect(cloudOverrideOffer()).toBeNull();
  });

  it("equal to the save's TE (198): applied without the question", async () => {
    const A = browser();
    const B = browser();
    await A.load();
    A.type(TE198);
    await flushOverrideSync();
    const p = await B.load();
    expect(cloudOverrideOffer()).toBeNull();
    expect(p.teOverride).toEqual(TE198);
  });

  it('the same numbers B already uses: no question', async () => {
    const A = browser();
    const B = browser();
    await B.load();
    const at = Date.now();
    B.type(TE197);
    await flushOverrideSync();
    vi.advanceTimersByTime(60_000);
    await A.load();
    A.type(TE197);
    await flushOverrideSync();
    // The collector keeps the first at for the same content (unchanged), so B has nothing newer to weigh: no question.
    expect(c.record(KEY, 'override')?.at).toBe(at);
    await B.load();
    expect(cloudOverrideOffer()).toBeNull();
    expect(readLocalOverride(ID)).toMatchObject({ teEarned: TE197, at });
  });

  it('an older cloud record than this browser: nothing changes, nothing asked', async () => {
    const A = browser();
    c.put(KEY, 'override', '0', T0 - 60_000, TE197);
    A.mem.set(`${TE_INPUTS_V2_PREFIX}:${ID}`, JSON.stringify({ teEarned: TE198, at: T0 - 1000, saveTE: 198 }));
    const p = await A.load();
    expect(p.teOverride).toEqual(TE198);
    expect(cloudOverrideOffer()).toBeNull();
    expect(c.calls.filter(x => x.url.includes('/sync/get'))).toEqual([]);
  });

  it('cloud empty: nothing changes here (never clears local data)', async () => {
    const A = browser();
    A.mem.set(`${TE_INPUTS_V2_PREFIX}:${ID}`, JSON.stringify({ teEarned: TE197, at: T0 - 1000 }));
    const p = await A.load();
    expect(p.teOverride).toEqual(TE197);
    expect(loadAutoPlannerTEOverride(ID)).toEqual(TE197);
  });
});

describe('conflicts and failures', () => {
  it('409: a newer record stored meanwhile is weighed as a read (asked here), nothing written back', async () => {
    const A = browser();
    await A.load();
    A.type(TE198);
    c.put(KEY, 'override', '0', T0 + 5000, TE197);
    await flushOverrideSync();
    expect(syncPuts()).toHaveLength(1);
    expect(cloudOverrideOffer()).toMatchObject({ teEarned: TE197, at: T0 + 5000 });
  });

  it('404 (an older collector): off for the page, quietly: no more calls', async () => {
    c.state.mode = 'old';
    const A = browser();
    await A.load();
    const n = syncCalls().length;
    expect(n).toBe(1);
    A.type(TE197);
    await flushOverrideSync();
    await syncOverrideFromCloud();
    expect(syncCalls()).toHaveLength(n);
  });

  it('429: waits retryAfter, then sends once', async () => {
    const A = browser();
    await A.load();
    c.state.mode = 'limit';
    c.state.retryAfter = 30;
    A.type(TE197);
    await flushOverrideSync();
    expect(syncPuts()).toHaveLength(1);
    c.state.mode = 'ok';
    await vi.advanceTimersByTimeAsync(29_000);
    expect(syncPuts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(syncPuts()).toHaveLength(2);
    expect(c.record(KEY, 'override')?.value).toEqual({ ...TE197, saveTE: 198 });
  });

  it('offline or 503: quiet, never a throw, the override here unchanged', async () => {
    for (const mode of ['offline', 'off'] as const) {
      c.state.mode = mode;
      const A = browser();
      const p = await A.load();
      A.type(TE197);
      await expect(flushOverrideSync()).resolves.toBeUndefined();
      expect(p.teOverride).toEqual(TE197);
    }
  });
});

describe('the switches', () => {
  it('Save online off: nothing read, nothing written', async () => {
    const A = browser();
    A.mem.set('aap.saveOnline', '0');
    c.put(KEY, 'override', '0', T0, TE197);
    await A.load();
    A.type(TE198);
    await flushOverrideSync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncCalls()).toEqual([]);
    expect(cloudOverrideOffer()).toBeNull();
  });

  it('SYNC_RECORDS off (as shipped): nothing read, nothing written', async () => {
    SYNC_RECORDS.enabled = false;
    const A = browser();
    c.put(KEY, 'override', '0', T0, TE197);
    await A.load();
    A.type(TE198);
    await flushOverrideSync();
    expect(syncCalls()).toEqual([]);
  });

  it('turned off with an edit waiting: not sent', async () => {
    const A = browser();
    await A.load();
    A.type(TE197);
    setSaveOnline(false);
    await vi.advanceTimersByTimeAsync(OVERRIDE_SYNC_DEBOUNCE_MS * 2);
    expect(syncPuts()).toEqual([]);
  });
});
