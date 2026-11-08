/**
 * QA review 7 Nov 2026 for the starting TE saved online (composables/useOverrideSync.ts):
 *  - finding 4 (MED): a tab that merely SAW a change (another tab's write, through the `storage` event; or a record
 *    it adopted from online) must never stamp it again and send it: only the tab where the player acted sends, with
 *    the action's own time. A tombstone adopted in tab A was re-sent by tab B with a fresh time.
 *  - finding 6 (LOW-MED): this device's clock behind the collector's made every edit lose to an older record (409),
 *    and a removal from elsewhere wiped the edit. The list's `now` sets an offset for the stamps (never past a day).
 * Placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { accountOf } from '@/search/runSaves';
import { getThresholdForTE } from '@/lib/truthEggs';
import { saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';
import { syncTEOverrideToAccount } from '@/lib/teOverrideAccount';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { resetSaveOnline } from '@/lib/saveOnline';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';
import {
  TE_INPUTS_V2_PREFIX,
  cloudOverrideOffer,
  flushOverrideSync,
  installTECacheObserver,
  onTECacheStorageEvent,
  resetOverrideSync,
  syncClock,
  syncOverrideFromCloud,
} from './useOverrideSync';

const applyAutoStartingTE = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/auto/startingTE', async orig => ({ ...(await orig<typeof import('@/auto/startingTE')>()), applyAutoStartingTE }));

const ID = 'EI0000000000000000';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const CACHE = `${TE_INPUTS_V2_PREFIX}:${ID}`;
const T0 = Date.UTC(2026, 10, 7, 18);
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
const raw = () => ({ eiUserId: ID, virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, getThresholdForTE(38)] } });

let c: FakeSyncCollector;
let mem: Map<string, string>;
let ls: Storage;

async function load() {
  mem = mem ?? new Map();
  ls = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('fetch', c.f);
  installTECacheObserver();
  resetSaveOnline();
  resetOverrideSync();
  setActivePinia(createPinia());
  defineStore('chainSearch', () => ({ submitUrl: c.submitUrl, availability: null, busy: false, sweepQueue: { at: -1 } }))();
  const s = useInitialStateStore();
  s.playerId = ID;
  s.rawBackup = raw() as never;
  s.lastBackupTime = Math.floor(T0 / 1000);
  syncTEOverrideToAccount();
  await vi.waitFor(() => expect(useFollowStore().cloudKey).toBe(KEY));
  await syncOverrideFromCloud();
  return useAutoPlannerStore();
}
/** Virtue Progress's own steps (no hook): the store, then the cache. */
function type(te: Record<string, number> | null) {
  useAutoPlannerStore().teOverride = te as never;
  saveAutoPlannerTEInputs(ID, te ? { teEarned: { ...te } as never } : null);
}
const syncPuts = () => c.calls.filter(x => x.method === 'PUT' && x.url.includes('/sync'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  mem = new Map();
  SYNC_RECORDS.enabled = true;
  for (const m of ['log', 'info', 'warn', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  SYNC_RECORDS.enabled = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('finding 4: only the tab where the player acted sends', () => {
  it("another tab's removal (an old one, adopted there from online): the storage event here sends nothing", async () => {
    await load();
    mem.set(`aap.teOverride.removedAt.${accountOf({ eiUserId: ID })}`, String(Date.now() - 60_000));
    mem.delete(CACHE);
    onTECacheStorageEvent({ key: CACHE, storageArea: ls } as never);
    await flushOverrideSync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPuts()).toEqual([]);
  });

  it("another tab's write of a value (stamped or not): nothing sent from here", async () => {
    await load();
    mem.set(CACHE, JSON.stringify({ teEarned: TE197 }));
    onTECacheStorageEvent({ key: CACHE, storageArea: ls } as never);
    mem.set(CACHE, JSON.stringify({ teEarned: TE197, at: T0 - 5, saveTE: 198 }));
    onTECacheStorageEvent({ key: CACHE, storageArea: ls } as never);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPuts()).toEqual([]);
  });

  it('a tombstone adopted from online here is not sent again', async () => {
    mem = new Map();
    mem.set(CACHE, JSON.stringify({ teEarned: TE197, at: T0 - 60_000, saveTE: 198 }));
    c.put(KEY, 'override', '0', T0 - 1000, { removed: true });
    const p = await load();
    expect(p.teOverride).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncPuts()).toEqual([]);
  });

  it('the player acting here still sends, once, with the time of the action', async () => {
    await load();
    const at = Date.now();
    type(TE197);
    await flushOverrideSync();
    expect(syncPuts()).toHaveLength(1);
    expect(c.record(KEY, 'override')?.at).toBe(at);
  });
});

describe("finding 6: this device's clock behind the collector's", () => {
  it('an edit made here after a removal elsewhere is stored, not undone by it (the offset from GET /sync)', async () => {
    c.state.skewMs = 3_600_000;
    // Another device removed it 5 minutes ago by the collector's clock (55 minutes ahead of this device's).
    c.put(KEY, 'override', '0', T0 + 3_600_000 - 300_000, { removed: true });
    await load();
    expect(syncClock() - Date.now()).toBeGreaterThan(3_500_000);
    type(TE197);
    await flushOverrideSync();
    expect(c.record(KEY, 'override')?.value).toEqual({ ...TE197, saveTE: 198 });
    expect(useAutoPlannerStore().teOverride).toEqual(TE197);
    expect(cloudOverrideOffer()).toBeNull();
  });

  it('a skew past a day is not believed (the stamps keep this clock); under a minute is none', async () => {
    c.state.skewMs = 3 * 86_400_000;
    await load();
    expect(syncClock()).toBe(Date.now());
    c.state.skewMs = 20_000;
    await load();
    expect(syncClock()).toBe(Date.now());
  });
});
