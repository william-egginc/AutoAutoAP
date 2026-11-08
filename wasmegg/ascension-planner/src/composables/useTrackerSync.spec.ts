/**
 * The Build-up tracker's ticks and kept plan saved online (client brief sections 1 and 3 "Ticks", "Plan", "Reads";
 * composables/useTrackerSync.ts): two simulated browsers on one account against one fake collector.
 *
 *  - TICKS: written from the player's checkbox only, 10 s after the last change, coalesced, one record per ascension
 *    (slot = its start); flushed at once on pagehide with keepalive; on 409 merged (sets, the newer side's unticks win)
 *    and sent again with a fresh `at`; at most the 3 newest ascensions synced; the body within the collector's caps.
 *  - PLAN: gzip of the kept plan, written only when a plan is first kept or the player re-plans; the first plan of an
 *    ascension wins (earlier saveSeconds), adopted only under this build's result code; a plan of a newer build is
 *    never overwritten, so two builds never replace each other in a loop; over 96 KB gzipped it stays local.
 *  - READS: in the same pass as the override (one GET /sync), /sync/get only for records newer than this browser's.
 *  - 404 off for the page; Save online off or SYNC_RECORDS off: nothing read or written. No payload holds an ID.
 * Placeholder ID only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { accountOf } from '@/search/runSaves';
import { readAnchoredPlan, readTicks, readUnticks, writeAnchoredPlan, writeTicks, writeUnticks, type AnchoredPlan } from '@/lib/buildUpTracker';
import { setResultCode } from '@/lib/resultCode';
import { PLAN_MAX_GZIP_BYTES, SYNC_RECORDS, gunzipText, mergeTicks } from '@/lib/syncedRecords';
import { resetSaveOnline, setSaveOnline } from '@/lib/saveOnline';
import { resetOverrideSync, syncOverrideFromCloud } from './useOverrideSync';
import {
  TICKS_DEBOUNCE_MS,
  flushTrackerSync,
  installTrackerSync,
  notePlanKept,
  noteTicksChange,
  resetTrackerSync,
  setTrackerBuild,
  syncedSlots,
  trackerSyncVersion,
} from './useTrackerSync';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';

const ID = 'EI0000000000000000';
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const ACCT = accountOf({ eiUserId: ID });
const T0 = Date.UTC(2026, 10, 7, 18);
const S = 1794000000;
let c: FakeSyncCollector;

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
    resetTrackerSync();
    installTrackerSync();
    setActivePinia(createPinia());
    defineStore('chainSearch', () => ({ submitUrl: c.submitUrl, availability: null, busy: false, sweepQueue: { at: -1 } }))();
    const s = useInitialStateStore();
    s.playerId = ID;
    s.rawBackup = { eiUserId: ID } as never;
    await vi.waitFor(() => expect(useFollowStore().cloudKey).toBe(KEY));
    await syncOverrideFromCloud();
  }
  /** The tracker's checkbox (useBuildUpTracker `saveOverrides`): this browser's storage, then the note. */
  function tick(slot: number, on: string[], off: string[] = []) {
    writeTicks(ACCT, slot, new Set(on));
    writeUnticks(ACCT, slot, new Set(off));
    noteTicksChange(ACCT, slot, new Set(on), new Set(off));
  }
  /** A plan kept (the first of the ascension, or a re-plan): stored as useBuildUpTracker stores it, then the note. */
  async function keep(saveSeconds: number, reason: 'first' | 'replan' = 'first', slot = S, label = 'Comfortable Nests') {
    writeAnchoredPlan(ACCT, planOf(saveSeconds, slot, label));
    await notePlanKept(ACCT, reason);
  }
  return { mem, load, tick, keep };
}

function planOf(saveSeconds: number, slot = S, label = 'Comfortable Nests'): AnchoredPlan {
  return {
    ascensionStart: slot,
    saveSeconds,
    plan: { actions: [{ kind: 'research', id: 'comfy_nests', label, at: saveSeconds + 60 }], siloSeconds: 0, variantKey: 'buildup' } as never,
  };
}

const puts = (kind: string) => c.calls.filter(x => x.method === 'PUT' && x.url.includes(`kind=${kind}`));
const ticksBody = (i = -1) => JSON.parse(puts('ticks').at(i)!.body!) as { ticked: string[]; unticked?: string[] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  SYNC_RECORDS.enabled = true;
  setResultCode('rc-now');
  setTrackerBuild('2026-11-07T00:00:00Z');
  for (const m of ['log', 'info', 'warn', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(async () => {
  for (const call of c.calls) {
    expect(call.url).not.toMatch(/EI\d{16}/i);
    if (call.body) expect(call.body).not.toMatch(/EI\d{16}/i);
    if (call.bytes) expect(await gunzipText(call.bytes)).not.toMatch(/EI\d{16}/i);
  }
  SYNC_RECORDS.enabled = false;
  setResultCode(null);
  setTrackerBuild(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('ticks: the merge (both orders)', () => {
  const a = { ticked: ['x', 'y'], unticked: ['z'], at: 2 };
  const b = { ticked: ['z', 'w'], unticked: ['y'], at: 1 };
  it("ticked = both sides' ticks less the newer side's unticks; unticked = the newer's, plus the older's not ticked by the newer", () => {
    expect(mergeTicks(a, b)).toEqual({ ticked: ['w', 'x', 'y'], unticked: ['z'] });
    expect(mergeTicks(b, a)).toEqual({ ticked: ['w', 'x', 'y'], unticked: ['z'] });
    const newerB = { ...b, at: 3 };
    expect(mergeTicks(a, newerB)).toEqual({ ticked: ['w', 'x', 'z'], unticked: ['y'] });
    expect(mergeTicks(newerB, a)).toEqual({ ticked: ['w', 'x', 'z'], unticked: ['y'] });
  });
});

describe('ticks: two browsers', () => {
  it('A ticks; one PUT 10 s after the last change; B shows it on its next read', async () => {
    const A = browser();
    const B = browser();
    await A.load();
    A.tick(S, ['l1']);
    await vi.advanceTimersByTimeAsync(3000);
    A.tick(S, ['l1', 'l2'], ['l3']);
    const at = Date.now();
    await vi.advanceTimersByTimeAsync(TICKS_DEBOUNCE_MS - 1);
    expect(puts('ticks')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(puts('ticks')).toHaveLength(1);
    expect(puts('ticks')[0].url).toBe(`https://collector.example/sync?k=${KEY}&kind=ticks&slot=${S}&at=${at}`);
    expect(ticksBody()).toEqual({ ticked: ['l1', 'l2'], unticked: ['l3'] });
    await B.load();
    const v = trackerSyncVersion.value;
    expect([...readTicks(ACCT, S)]).toEqual(['l1', 'l2']);
    expect([...readUnticks(ACCT, S)]).toEqual(['l3']);
    expect(v).toBeGreaterThan(0);
    // B's read wrote nothing.
    expect(puts('ticks')).toHaveLength(1);
  });

  it('a later change: a second PUT 10 s after it; nothing more without a change', async () => {
    const A = browser();
    await A.load();
    A.tick(S, ['l1']);
    await vi.advanceTimersByTimeAsync(TICKS_DEBOUNCE_MS);
    A.tick(S, ['l1', 'l2']);
    await vi.advanceTimersByTimeAsync(TICKS_DEBOUNCE_MS * 5);
    expect(puts('ticks')).toHaveLength(2);
  });

  it('pagehide: the waiting change goes at once, with keepalive', async () => {
    const A = browser();
    await A.load();
    A.tick(S, ['l1']);
    await flushTrackerSync({ keepalive: true });
    expect(puts('ticks')).toHaveLength(1);
    expect(puts('ticks')[0].keepalive).toBe(true);
  });

  it('409: merged with the newer cloud record and sent again with a fresh at; this browser shows the merge', async () => {
    const A = browser();
    await A.load();
    c.put(KEY, 'ticks', String(S), T0 + 5000, { ticked: ['x', 'y'], unticked: ['z'] });
    A.tick(S, ['z', 'w'], ['y']);
    vi.setSystemTime(T0 + 6000);
    await flushTrackerSync();
    expect(puts('ticks')).toHaveLength(2);
    expect(ticksBody()).toEqual({ ticked: ['w', 'x', 'y'], unticked: ['z'] });
    expect(Number(new URL(puts('ticks')[1].url).searchParams.get('at'))).toBeGreaterThan(T0 + 5000);
    expect([...readTicks(ACCT, S)].sort()).toEqual(['w', 'x', 'y']);
  });

  it('B has a change not yet sent when a newer cloud record is read: merged, and B sends the merge', async () => {
    const A = browser();
    const B = browser();
    await B.load();
    B.tick(S, ['b1']);
    const Bmem = new Map(B.mem);
    await A.load();
    A.tick(S, ['a1']);
    await flushTrackerSync();
    // B again (its change still waiting, as if its page had been hidden before the 10 s).
    for (const [k, v] of Bmem) B.mem.set(k, v);
    vi.setSystemTime(T0 + 60_000);
    await B.load();
    expect([...readTicks(ACCT, S)].sort()).toEqual(['a1', 'b1']);
    await flushTrackerSync();
    expect(ticksBody()).toEqual({ ticked: ['a1', 'b1'], unticked: [] });
  });

  it('a new ascension is a new slot; only the 3 newest are synced', async () => {
    const A = browser();
    await A.load();
    const slots = [S, S + 86400 * 10, S + 86400 * 20, S + 86400 * 30];
    for (const s of slots) {
      A.tick(s, ['l1']);
      await flushTrackerSync();
    }
    expect(puts('ticks').map(p => new URL(p.url).searchParams.get('slot'))).toEqual(slots.map(String));
    expect(syncedSlots(ACCT)).toEqual([slots[3], slots[2], slots[1]]);
    // The oldest ascension, changed again: kept here, not synced.
    A.tick(S, ['l1', 'l2']);
    await flushTrackerSync();
    expect(puts('ticks')).toHaveLength(4);
  });

  it("the body stays inside the collector's caps: at most 300 keys, 1 to 120 characters, no control characters, 16 KB", async () => {
    const A = browser();
    await A.load();
    const many = Array.from({ length: 400 }, (_, i) => `line-${i}-${'x'.repeat(40)}`);
    A.tick(S, [...many, '', 'y'.repeat(121), 'bad\u0001key']);
    await flushTrackerSync();
    const b = ticksBody();
    expect(b.ticked.length).toBeLessThanOrEqual(300);
    expect(b.ticked.every(k => k.length >= 1 && k.length <= 120 && !/[\u0000-\u001f\u007f]/.test(k))).toBe(true);
    expect(new TextEncoder().encode(puts('ticks')[0].body!).length).toBeLessThanOrEqual(16 * 1024);
  });
});

describe('the plan', () => {
  it('first plan wins: A keeps (save 100), B keeps a later one (save 200): B takes A\'s, one PUT', async () => {
    const A = browser();
    const B = browser();
    await A.load();
    await A.keep(T0 / 1000 - 100);
    expect(puts('plan')).toHaveLength(1);
    expect(await gunzipText(puts('plan')[0].bytes!)).toContain('"rc":"rc-now"');
    await B.load();
    await B.keep(T0 / 1000 - 50);
    expect(puts('plan')).toHaveLength(1);
    expect(readAnchoredPlan(ACCT)?.saveSeconds).toBe(T0 / 1000 - 100);
  });

  it('read: adopted when this browser has none for the ascension, or a later one; never over an earlier one', async () => {
    const A = browser();
    await A.load();
    await A.keep(T0 / 1000 - 100);
    const B = browser();
    await B.load();
    expect(readAnchoredPlan(ACCT)?.saveSeconds).toBe(T0 / 1000 - 100);
    const C = browser();
    C.mem.set('x', '1');
    await C.load();
    writeAnchoredPlan(ACCT, planOf(T0 / 1000 - 300));
    resetOverrideSync();
    resetTrackerSync();
    installTrackerSync();
    await syncOverrideFromCloud();
    expect(readAnchoredPlan(ACCT)?.saveSeconds).toBe(T0 / 1000 - 300);
  });

  it('re-plan replaces the cloud plan (the player asked); a read writes nothing', async () => {
    const A = browser();
    await A.load();
    await A.keep(T0 / 1000 - 100);
    await A.keep(T0 / 1000 - 10, 'replan', S, 'Hen House Remodel');
    expect(puts('plan')).toHaveLength(2);
    expect(await gunzipText(puts('plan')[1].bytes!)).toContain('Hen House Remodel');
    const B = browser();
    await B.load();
    expect(puts('plan')).toHaveLength(2);
  });

  it('two builds: the newer replaces the older once, the older never overwrites it, no loop', async () => {
    const A = browser();
    const B = browser();
    setResultCode('rc-old');
    setTrackerBuild('2026-11-01T00:00:00Z');
    await A.load();
    await A.keep(T0 / 1000 - 100);
    expect(puts('plan')).toHaveLength(1);
    setResultCode('rc-new');
    setTrackerBuild('2026-11-07T00:00:00Z');
    await B.load();
    // Another build's plan is never adopted.
    expect(readAnchoredPlan(ACCT)).toBeNull();
    await B.keep(T0 / 1000 - 50);
    expect(puts('plan')).toHaveLength(2);
    setResultCode('rc-old');
    setTrackerBuild('2026-11-01T00:00:00Z');
    await A.load();
    expect(readAnchoredPlan(ACCT)?.saveSeconds).toBe(T0 / 1000 - 100);
    await A.keep(T0 / 1000 - 10, 'replan');
    await A.keep(T0 / 1000 - 5, 'first');
    expect(puts('plan')).toHaveLength(2);
    setResultCode('rc-new');
    setTrackerBuild('2026-11-07T00:00:00Z');
    await B.load();
    expect(puts('plan')).toHaveLength(2);
  });

  it('over 96 KB gzipped: not sent, kept here, no error', async () => {
    const A = browser();
    await A.load();
    // xorshift32: letters that gzip to about 218 KB (measured with node zlib).
    let x = 2463534242;
    const rnd = () => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>>= 0);
    };
    const noise = Array.from({ length: 300_000 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[rnd() % 52]).join('');
    await A.keep(T0 / 1000 - 100, 'first', S, noise);
    expect(PLAN_MAX_GZIP_BYTES).toBe(96 * 1024);
    expect(puts('plan')).toEqual([]);
    expect(readAnchoredPlan(ACCT)?.plan.actions[0].label).toBe(noise);
  });
});

describe('failures and switches', () => {
  it('404 (an older collector): off for the page, no more calls', async () => {
    c.state.mode = 'old';
    const A = browser();
    await A.load();
    const n = c.calls.filter(x => x.url.includes('/sync')).length;
    A.tick(S, ['l1']);
    await flushTrackerSync();
    await A.keep(T0 / 1000);
    expect(c.calls.filter(x => x.url.includes('/sync'))).toHaveLength(n);
  });

  it('Save online off: nothing read or written', async () => {
    const A = browser();
    A.mem.set('aap.saveOnline', '0');
    c.put(KEY, 'ticks', String(S), T0, { ticked: ['x'] });
    await A.load();
    A.tick(S, ['l1']);
    await flushTrackerSync({ keepalive: true });
    await A.keep(T0 / 1000);
    expect(c.calls.filter(x => x.url.includes('/sync'))).toEqual([]);
    expect([...readTicks(ACCT, S)]).toEqual(['l1']);
  });

  it('SYNC_RECORDS off: nothing read or written', async () => {
    SYNC_RECORDS.enabled = false;
    const A = browser();
    await A.load();
    A.tick(S, ['l1']);
    await vi.advanceTimersByTimeAsync(TICKS_DEBOUNCE_MS * 2);
    await A.keep(T0 / 1000);
    expect(c.calls.filter(x => x.url.includes('/sync'))).toEqual([]);
  });

  it('one list per read pass, shared with the override', async () => {
    const A = browser();
    await A.load();
    expect(c.calls.filter(x => x.method === 'GET' && /\/sync\?k=/.test(x.url))).toHaveLength(1);
  });
});

describe("Reliability's onlineFetch, on the tracker's writes too (merged with spec-syncclient-a-rel)", () => {
  it('Save online turned off during a ticks PUT refused as "ahead": the resend never goes', async () => {
    const A = browser();
    await A.load();
    vi.setSystemTime(T0 + 3_600_000);
    A.tick(S, ['l1']);
    vi.setSystemTime(T0);
    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      const r = c.f(url, init as never);
      if (init?.method === 'PUT') setSaveOnline(false);
      return r;
    });
    await flushTrackerSync();
    expect(puts('ticks')).toHaveLength(1);
  });
});

describe('wiring (composables/useBuildUpTracker.ts, not a hash input)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'useBuildUpTracker.ts'), 'utf8');
  it("the checkbox's save notes the ticks; the first plan kept and a re-plan note the plan; nothing else does", () => {
    const save = src.match(/function saveOverrides\([\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(save).toMatch(/writeUnticks\(acct, k, off\);\s*noteTicksChange\(acct, k, on, off\);/);
    expect(src.match(/noteTicksChange\(/g)).toHaveLength(1);
    expect(src.match(/notePlanKept\(acct, 'first'\)/g)).toHaveLength(1);
    expect(src.match(/notePlanKept\(acct, 'replan'\)/g)).toHaveLength(1);
  });
  it('a plan or ticks taken from online make the tracker read again', () => {
    expect(src).toMatch(/trackerSyncVersion/);
  });
});
