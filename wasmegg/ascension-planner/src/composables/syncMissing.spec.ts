/**
 * A collector with no /sync YET (Reliability, 9 Nov 2026: R8 goes live with SYNC_RECORDS on, and the collector that
 * adds /sync and /forget is deployed minutes to hours after it). A 404 from /sync is "not there yet", not "never":
 *
 *  - nothing more is asked of that collector for SYNC_MISSING_RECHECK_MS (10 minutes), then ONE read checks again; after
 *    SYNC_MISSING_WINDOWS such checks with no /sync (2 hours) it is off for the page, as before. Never a flood, never a
 *    throw, nothing said.
 *  - a change made meanwhile (the starting TE, the tracker's ticks) is KEPT waiting and sent once the collector answers,
 *    stamped with the time of the player's action (so it never beats a newer record from another device: 409 as usual).
 *  - a 404 is never read as "nothing saved online": nothing here is cleared or replaced.
 *  - "Delete everything" is not offered while this collector is known to have no /sync (it would only say "not
 *    available yet" and turn Save online off); it comes back once the collector answers.
 * Placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { accountOf } from '@/search/runSaves';
import { getThresholdForTE } from '@/lib/truthEggs';
import { saveAutoPlannerTEInputs, loadAutoPlannerTEOverride } from '@/lib/autoPlannerFormCache';
import { readTicks, writeTicks, writeUnticks } from '@/lib/buildUpTracker';
import { setResultCode } from '@/lib/resultCode';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { resetSaveOnline } from '@/lib/saveOnline';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';
import {
  SYNC_MISSING_RECHECK_MS,
  SYNC_MISSING_WINDOWS,
  cloudOverrideOffer,
  noteTEOverrideChange,
  readLocalOverride,
  resetOverrideSync,
  syncOverrideFromCloud,
} from './useOverrideSync';
import {
  TICKS_DEBOUNCE_MS,
  installTrackerSync,
  noteTicksChange,
  resetTrackerSync,
  setTrackerBuild,
} from './useTrackerSync';
import { resetForgetEverything, useForgetEverything } from './useForgetEverything';

const applyAutoStartingTE = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/auto/startingTE', async orig => ({
  ...(await orig<typeof import('@/auto/startingTE')>()),
  applyAutoStartingTE,
}));

const ID = 'EI0000000000000000';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const ACCT = accountOf({ eiUserId: ID });
const T0 = Date.UTC(2026, 10, 9, 18);
const S = 1794000000;
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
let c: FakeSyncCollector;
let mem: Map<string, string>;

async function load() {
  mem = new Map();
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
  resetTrackerSync();
  resetForgetEverything();
  installTrackerSync();
  setActivePinia(createPinia());
  defineStore('chainSearch', () => ({
    submitUrl: c.submitUrl,
    availability: null,
    busy: false,
    isRunning: false,
    sweepQueue: { at: -1 },
  }))();
  const s = useInitialStateStore();
  s.playerId = ID;
  s.rawBackup = {
    eiUserId: ID,
    virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, getThresholdForTE(38)] },
  } as never;
  s.lastBackupTime = Math.floor(T0 / 1000);
  await vi.waitFor(() => expect(useFollowStore().cloudKey).toBe(KEY));
  await syncOverrideFromCloud();
}
/** The player types a starting TE (the cache's write, then the note, as the banner's buttons do). */
function typeTE(te: Record<string, number>) {
  saveAutoPlannerTEInputs(ID, { teEarned: { ...te } as never });
  noteTEOverrideChange(ID, te as never);
}
function tick(on: string[]) {
  writeTicks(ACCT, S, new Set(on));
  writeUnticks(ACCT, S, new Set());
  noteTicksChange(ACCT, S, new Set(on), new Set());
}
const syncCalls = () => c.calls.filter(x => x.url.includes('/sync'));
const syncPuts = (kind: string) => syncCalls().filter(x => x.method === 'PUT' && x.url.includes(`kind=${kind}`));
const syncLists = () => syncCalls().filter(x => x.method === 'GET' && new URL(x.url).pathname === '/sync');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  SYNC_RECORDS.enabled = true;
  setResultCode('rc-now');
  setTrackerBuild('2026-11-09T00:00:00Z');
  for (const m of ['log', 'info', 'warn', 'debug', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const call of c.calls) {
    expect(call.url).not.toMatch(/EI\d{16}/i);
    if (call.body) expect(call.body).not.toMatch(/EI\d{16}/i);
  }
  SYNC_RECORDS.enabled = false;
  setResultCode(null);
  setTrackerBuild(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('a collector with no /sync yet (404)', () => {
  it('the starting TE typed meanwhile is kept and sent once the collector answers, after a read, with its own time', async () => {
    c.state.mode = 'old';
    await load();
    expect(syncCalls()).toHaveLength(1);
    const typedAt = Date.now() + 1000;
    vi.setSystemTime(typedAt);
    typeTE(TE197);
    await vi.advanceTimersByTimeAsync(60_000);
    // Nothing asked while it is known to be missing.
    expect(syncCalls()).toHaveLength(1);
    expect(readLocalOverride(ID).teEarned).toEqual(TE197);
    c.state.mode = 'ok';
    await vi.advanceTimersByTimeAsync(SYNC_MISSING_RECHECK_MS);
    expect(syncLists()).toHaveLength(2);
    expect(syncPuts('override')).toHaveLength(1);
    expect(syncPuts('override')[0].url).toContain(`&at=${typedAt}`);
    expect(c.record(KEY, 'override')?.value).toEqual({ ...TE197, saveTE: 198 });
    expect(cloudOverrideOffer()).toBeNull();
    // Kept here throughout.
    expect(loadAutoPlannerTEOverride(ID)).toEqual(TE197);
  });

  it('ticks made meanwhile are kept and sent once the collector answers', async () => {
    c.state.mode = 'old';
    await load();
    tick(['l1', 'l2']);
    await vi.advanceTimersByTimeAsync(TICKS_DEBOUNCE_MS * 3);
    expect(syncPuts('ticks')).toEqual([]);
    c.state.mode = 'ok';
    await vi.advanceTimersByTimeAsync(SYNC_MISSING_RECHECK_MS);
    expect(syncPuts('ticks')).toHaveLength(1);
    expect(JSON.parse(syncPuts('ticks')[0].body!)).toEqual({ ticked: ['l1', 'l2'], unticked: [] });
    expect([...readTicks(ACCT, S)]).toEqual(['l1', 'l2']);
  });

  it('still missing: one read per 10 minutes, then off for the page; no write, no throw, nothing asked or cleared', async () => {
    c.state.mode = 'old';
    await load();
    typeTE(TE197);
    tick(['l1']);
    await vi.advanceTimersByTimeAsync(SYNC_MISSING_RECHECK_MS * (SYNC_MISSING_WINDOWS + 6));
    expect(syncLists()).toHaveLength(SYNC_MISSING_WINDOWS);
    expect(syncCalls()).toHaveLength(SYNC_MISSING_WINDOWS);
    expect(cloudOverrideOffer()).toBeNull();
    expect(readLocalOverride(ID).teEarned).toEqual(TE197);
    expect([...readTicks(ACCT, S)]).toEqual(['l1']);
    // Off for the page now: a later change asks nothing.
    typeTE({ ...TE197, kindness: 36 });
    await vi.advanceTimersByTimeAsync(SYNC_MISSING_RECHECK_MS * 3);
    expect(syncCalls()).toHaveLength(SYNC_MISSING_WINDOWS);
  });

  it('a network error is not a 404: the next read is not held back', async () => {
    c.state.mode = 'offline';
    await load();
    c.state.mode = 'ok';
    await syncOverrideFromCloud();
    expect(syncLists()).toHaveLength(2);
  });
});

describe('Delete everything while the collector has no /sync', () => {
  it('not offered after a 404 from /sync; offered again once the collector answers', async () => {
    c.state.mode = 'ok';
    await load();
    const d = useForgetEverything();
    expect(d.available.value).toBe(true);
    c.state.mode = 'old';
    c.state.forgetMode = 'old';
    resetOverrideSync();
    await syncOverrideFromCloud();
    expect(d.available.value).toBe(false);
    c.state.mode = 'ok';
    c.state.forgetMode = 'ok';
    await vi.advanceTimersByTimeAsync(SYNC_MISSING_RECHECK_MS);
    expect(d.available.value).toBe(true);
  });
});
