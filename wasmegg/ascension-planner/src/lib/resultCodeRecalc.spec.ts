/**
 * RELEASE 7, ITEM 1 (allanfieldhouse): after reloading onto a new build the page did NOT work anything out again: it
 * kept the answer the OLD code had worked out, because his inputs had not changed; only "Work it out again" gave the
 * right one. The rule: a kept result worked out by older code is worked out again on a new build (lib/resultCode.ts),
 * and one kept by the same build is used as it is (no needless run). Each kept result below is written under build
 * 'A' and read under build 'B' with identical inputs, then under 'A' again. Fixed clocks; no waits on the wall clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setResultCode } from './resultCode';
import { BUILDUP_PLAN_KEY, readBuildUpPlan, recordBuildUpPlan, recordSim, simKey, simSetupKey } from './followSim';
import {
  needsPricingRecord,
  pricingSetupKey,
  readPricingRecords,
  recordPricing,
  recordSources,
  staleRecordSources,
  type SnapPricing,
} from './followEstimate';
import { keepHeld, readHeld } from './heldEstimate';
import { ANCHOR_KEY_PREFIX, readAnchoredPlan, readTicks, writeAnchoredPlan, writeTicks } from './buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from './buildUpTracker.fixture';
import { planFromSnapshot, type SnapLike } from './nowPlan';
import { buildTile } from './savedTiles';
import { entryKeyOf } from './answersCloud';
import { savedAnswerFits, tablesIdentity } from '@/search/instantTables';
import { latestSnapshotFor, writeSnapshot } from '@/search/instantSnapshot';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from '@/composables/useCurrentSim';
import { useBuildUpTracker } from '@/composables/useBuildUpTracker';
import type { BuildUpPlan } from '@/search/buildUpActions';
import type { LegSummary, SearchInputs } from '@/search/types';
import type { TableEntry } from '@/search/tableBracket';

const T0 = 1_800_000_000;
const NOW_MS = T0 * 1000 + 3_600_000;
let mem: Map<string, string>;
const st = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', st);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  setResultCode(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The same Setup on both builds. */
const SETUP = { availability: null, useHours: false, timeOff: [], noPrestige: [], firstAscension: 'auto', deferShifts: false };

describe('(a) aap-follow-sim: the simulated ascension', () => {
  let runs: { resolve: (l: LegSummary | null) => void }[];
  beforeEach(() => {
    runs = [];
    setSimTiming({ delayMs: 0 });
    setSimRunner((): SimRunner => ({ run: () => new Promise(resolve => runs.push({ resolve })), terminate: () => undefined }));
  });
  afterEach(() => {
    setSimTiming(null);
    setSimRunner(null);
  });
  /** What useNowPage asks for (its setup key from `simSetupKey`, worked out under the build that loads the page). */
  const request = (): SimRequest => {
    const setup = simSetupKey(SETUP);
    const o = { account: 'acct', backupTime: T0, route: [226, 277], setup };
    return { key: simKey(o), ...o, inputs: () => ({ planStart: T0, currentTE: 200 }) as unknown as SearchInputs };
  };
  const leg = { key: 'continue', startTime: T0, endTime: T0 + 3600, endTE: 226, buildPhaseEndTime: null, shifts: [] };
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await nextTick();
      await new Promise(r => setTimeout(r, 0));
    }
  };
  async function load(): Promise<number> {
    const scope = effectScope();
    scope.run(() => useCurrentSim(ref<SimRequest | null>(request()), ref(false), ref(false)));
    await flush();
    scope.stop();
    return runs.length;
  }

  it('kept under build A, loaded under build B with the same inputs: not reused, a run is asked', async () => {
    setResultCode('A');
    expect(recordSim({ ...request(), route: [226, 277], at: NOW_MS, leg })).toBe(true);
    expect(recordBuildUpPlan(request().key, fixturePlan('acct'))).toBe(true);
    setResultCode('B');
    expect(await load()).toBe(1);
    // Its build-up plan, kept under the same key, is not found either.
    expect(readBuildUpPlan(request().key)).toBeNull();
    expect(mem.has(BUILDUP_PLAN_KEY)).toBe(true);
  });

  it('the same build: reused, no run', async () => {
    setResultCode('A');
    recordSim({ ...request(), route: [226, 277], at: NOW_MS, leg });
    expect(await load()).toBe(0);
  });
});

describe('(b) aap-follow-pricing: the pricing record', () => {
  const pricing: SnapPricing = {
    v: 1,
    final: 490,
    options: { startTE: 200, start: T0, firstLegs: [{ to: 226 }] } as unknown as SnapPricing['options'],
  };
  const setupKey = () =>
    pricingSetupKey({ availability: null, timeOff: [], noPrestige: [], useHours: false, firstAscension: 'auto', zone: ZONE, deferShifts: false, target: 490 });
  const exact = () => recordSources(readPricingRecords(), { account: 'acct', backupTime: T0, setup: setupKey(), meta: null });

  it('kept under build A, read under build B: not this save and setup’s record, so it is worked out again; priced from meanwhile as stale', () => {
    setResultCode('A');
    expect(recordPricing({ account: 'acct', backupTime: T0, setup: setupKey(), url: 'x.bin', tableTo: 490, at: NOW_MS, pricing })).toBe(true);
    setResultCode('B');
    expect(exact()).toEqual([]);
    expect(needsPricingRecord(exact(), [226, 277], 200)).toBe(true);
    const stale = staleRecordSources(readPricingRecords(), { account: 'acct', backupTime: T0, setup: setupKey(), currentTE: 200, meta: null });
    expect(stale).toHaveLength(1);
    expect(stale[0].stale).toBe(true);
  });

  it('the same build: it is the record, nothing to work out', () => {
    setResultCode('A');
    recordPricing({ account: 'acct', backupTime: T0, setup: setupKey(), url: 'x.bin', tableTo: 490, at: NOW_MS, pricing });
    expect(exact()).toHaveLength(1);
    expect(needsPricingRecord(exact(), [226, 277], 200)).toBe(false);
  });
});

describe('(c) aap-follow-estimate-held: the estimate shown last', () => {
  const held = { account: 'acct', goalKey: 'fastest-490', chain: [226, 277], at: NOW_MS, plan: { end: T0 }, card: { price: 'estimate' } };

  it('kept under build A, read under build B: marked as an older build’s (shown only as from before, never as current)', () => {
    setResultCode('A');
    expect(keepHeld(held)).toBe(true);
    setResultCode('B');
    expect(readHeld('acct', 'fastest-490', [226, 277])).toMatchObject({ at: NOW_MS, olderCode: true });
  });

  it('one kept before Release 7 (no rc) reads as an older build’s', () => {
    mem.set('aap-follow-estimate-held', JSON.stringify([held]));
    expect(readHeld('acct', 'fastest-490', [226, 277])).toMatchObject({ olderCode: true });
  });

  it('the same build: as it was', () => {
    setResultCode('A');
    keepHeld(held);
    const h = readHeld('acct', 'fastest-490', [226, 277]);
    expect(h).toMatchObject({ at: NOW_MS, rc: 'A' });
    expect(h).not.toHaveProperty('olderCode');
  });
});

describe('(d) the Build-up tracker plan (aap.buildup.plan.<acct>)', () => {
  const A1 = mt(10, 30, 8, 41);
  function mount(fresh: BuildUpPlan | null = null) {
    const r = {
      account: ref<string | null>('acct-hash'),
      hasSave: ref(true),
      onVirtue: ref<boolean | null>(true),
      followed: ref(true),
      building: ref(true),
      ascensionStart: ref<number | null>(A1),
      saveSeconds: ref(mt(10, 30, 12, 5)),
      zone: ref(ZONE),
      hours: ref(HOURS),
      now: ref(mt(10, 30, 12, 10)),
      fresh: ref<BuildUpPlan | null>(fresh),
      sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    };
    const scope = effectScope();
    const t = scope.run(() => useBuildUpTracker(r as never))!;
    return { t, scope, r };
  }

  it('planned under build A, loaded under build B: dropped and planned again once; the player’s ticks are kept', async () => {
    setResultCode('A');
    expect(writeAnchoredPlan('acct-hash', { ascensionStart: A1, saveSeconds: mt(10, 30, 9, 0), plan: fixturePlan() })).toBe(true);
    writeTicks('acct-hash', A1, new Set(['line-1', 'line-2']));
    setResultCode('B');
    const { t, scope, r } = mount();
    // Dropped: the plan is wanted again.
    expect(readAnchoredPlan('acct-hash')).toBeNull();
    expect(t.wanted.value).toBe(true);
    expect(t.state.value).toBe('working');
    // The new plan comes: kept under build B, anchored on this save; ready, and not asked for again.
    r.fresh.value = fixturePlan();
    await nextTick();
    expect(readAnchoredPlan('acct-hash')).toMatchObject({ ascensionStart: A1, saveSeconds: mt(10, 30, 12, 5), rc: 'B' });
    expect(t.state.value).toBe('ready');
    expect(t.wanted.value).toBe(false);
    // The ticks were never touched.
    expect([...readTicks('acct-hash', A1)].sort()).toEqual(['line-1', 'line-2']);
    scope.stop();
    // Loaded again under B: kept, never planned again.
    const again = mount();
    expect(again.t.state.value).toBe('ready');
    expect(again.t.wanted.value).toBe(false);
    again.scope.stop();
  });

  it('one kept before Release 7 (no rc) is an older build’s: dropped once', () => {
    mem.set(ANCHOR_KEY_PREFIX + 'acct-hash', JSON.stringify({ ascensionStart: A1, saveSeconds: 1, plan: fixturePlan() }));
    const { t, scope } = mount();
    expect(t.wanted.value).toBe(true);
    expect(mem.has(ANCHOR_KEY_PREFIX + 'acct-hash')).toBe(false);
    scope.stop();
  });

  it('the same build: kept as it is, anchored to its first save, no re-plan', () => {
    setResultCode('A');
    writeAnchoredPlan('acct-hash', { ascensionStart: A1, saveSeconds: mt(10, 30, 9, 0), plan: fixturePlan() });
    const { t, scope } = mount();
    expect(t.state.value).toBe('ready');
    expect(t.wanted.value).toBe(false);
    expect(readAnchoredPlan('acct-hash')).toMatchObject({ saveSeconds: mt(10, 30, 9, 0), rc: 'A' });
    scope.stop();
  });
});

describe('(e) the instant answer kept (cached answers first) and online (/answers)', () => {
  const maxed: TableEntry = { file: 'table-v2.bin', simVersion: 's', builtAt: '2026-10-24T00:00:00Z', from: 100, bonus: 1, k: 1 } as unknown as TableEntry;
  const snap = (rc: string | undefined) => ({
    v: 1,
    at: NOW_MS - 60_000,
    result: { best: null, byAscensions: [] },
    header: { from: 100 },
    tableUrl: 'table-v2.bin',
    gearRule: 3,
    tables: tablesIdentity([maxed], ['table-v2.bin']),
    meta: { account: 'acct', goal: 'target 490', backupTime: T0 },
    ...(rc ? { rc } : {}),
  });

  it('worked out under build A, loaded under build B with the same inputs: not put back as the answer', () => {
    setResultCode('A');
    const s = snap('A');
    setResultCode('B');
    // The tables there are now, as build B reads them (the same files).
    const now = tablesIdentity([maxed], ['table-v2.bin']);
    expect(savedAnswerFits(s, 3, now)).toBe(false);
    // Not even offline (tables.json unreadable), where a saved answer otherwise stands.
    expect(savedAnswerFits(s, 3, null)).toBe(false);
    // One saved before Release 7 (no rc): older code.
    expect(savedAnswerFits(snap(undefined), 3, null)).toBe(false);
  });

  it('it is still there to draw as from before while it is worked out (the page marks it "(older version)")', () => {
    setResultCode('A');
    expect(writeSnapshot('k|0', snap('A'))).toBe(true);
    setResultCode('B');
    expect(latestSnapshotFor({ key: 'k|0', account: 'acct', goal: 'target 490' }, NOW_MS)?.value).toMatchObject({ rc: 'A' });
  });

  it('online: the entry key carries the code, so a browser on newer code never takes an older build’s as its exact match', () => {
    setResultCode('A');
    const a = entryKeyOf({ goal: 'target 490', backupTime: T0, snapKey: 'k|0', tables: tablesIdentity([maxed], ['table-v2.bin']) });
    const aNone = entryKeyOf({ goal: 'target 490', backupTime: T0, snapKey: 'k|0', tables: null });
    setResultCode('B');
    const b = entryKeyOf({ goal: 'target 490', backupTime: T0, snapKey: 'k|0', tables: tablesIdentity([maxed], ['table-v2.bin']) });
    const bNone = entryKeyOf({ goal: 'target 490', backupTime: T0, snapKey: 'k|0', tables: null });
    expect(b).not.toBe(a);
    expect(bNone).not.toBe(aNone);
    // Same shape as before: a1.<goal>.<save>.<fnv>.<fnv>, which the collector accepts (collector/answers.js E_RE).
    for (const e of [a, b, aNone, bNone]) expect(e).toMatch(/^a1\.t490\.1800000000\.[0-9a-f]{8}\.[0-9a-f]{8}$/);
  });

  it('the same build: put back as it is, no run', () => {
    setResultCode('A');
    const s = snap('A');
    expect(savedAnswerFits(s, 3, tablesIdentity([maxed], ['table-v2.bin']))).toBe(true);
    expect(savedAnswerFits(s, 3, null)).toBe(true);
  });
});

describe('(f) a saved answer’s How sure (worked out on read, from the kept answer)', () => {
  const route = (chain: number[], end: number) => ({
    chain,
    end,
    legs: chain.map((to, i) => ({ to, endTE: to, start: T0 + i * 3600, end: T0 + (i + 1) * 3600, label: '' })),
  });
  const snapOf = (rc: string | undefined): SnapLike =>
    ({
      at: NOW_MS - 60_000,
      result: { best: route([300, 490], T0 + 86_400 * 10), byAscensions: [null, route([300, 490], T0 + 86_400 * 10), route([250, 350, 490], T0 + 86_400 * 12)] },
      meta: { account: 'acct', goal: 'target 490', backupTime: T0 },
      ...(rc ? { rc } : {}),
    }) as unknown as SnapLike;
  const tile = (s: SnapLike) =>
    buildTile({
      goal: 'fastest',
      target: 490,
      deadline: null,
      nowMs: NOW_MS,
      save: { seconds: T0, te: 200 },
      snapshot: planFromSnapshot(s, 'fastest'),
      lastChecked: null,
      history: [],
      board: null,
      saved: [],
    });

  it('an instant answer build A worked out, read under build B: Low, said to be an older version’s', () => {
    setResultCode('A');
    const s = snapOf('A');
    setResultCode('B');
    expect(planFromSnapshot(s, 'fastest')).toMatchObject({ olderCode: true });
    expect(tile(s).sure).toMatchObject({ level: 'low', reason: 'worked out by an older version of this page' });
  });

  it('the same build: How sure as before (the instant answer is Medium at best)', () => {
    setResultCode('A');
    const s = snapOf('A');
    expect(planFromSnapshot(s, 'fastest')).not.toHaveProperty('olderCode');
    expect(tile(s).sure?.level).toBe('medium');
  });
});
