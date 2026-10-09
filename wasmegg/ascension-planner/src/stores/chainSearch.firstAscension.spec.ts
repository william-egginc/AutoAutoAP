/**
 * The first ascension's setting in the store (search/firstAscension.ts): Your setup's choice and
 * Classic's A1 dropdown kept in step, Classic's one-hour rule, and a run started under the old
 * boolean carrying on exactly as it began.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { SearchInputs } from '@/search/types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

/** What the workers were handed, per run. */
const pooled: SearchInputs[] = [];
vi.mock('@/search/pool', () => ({
  createChainSearchPool: vi.fn(async (inputs: SearchInputs) => {
    pooled.push(inputs);
    return { size: 1, resize: () => {}, terminate: () => {}, evaluate: async () => ({ results: [] }) };
  }),
}));

const { useChainSearchStore } = await import('./chainSearch');
const { useAutoPlannerStore } = await import('./autoPlanner');
const { useInitialStateStore } = await import('./initialState');
const { useActionsStore } = await import('./actions');
const { buildCheckpoint, saveCheckpoint } = await import('@/search/persistence');
const { saveRunInputs } = await import('@/search/runSaves');
const { formatInZone } = await import('@/search/csv');

function installStubs(): void {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => {
  db.clear();
  pooled.length = 0;
  installStubs();
  setActivePinia(createPinia());
});

describe("Your setup's First ascension and Classic's A1 dropdown", () => {
  it('defaults to Fastest, with nothing picked in Classic', () => {
    const store = useChainSearchStore();
    expect(store.firstAscension).toBe('auto');
    expect(store.firstAscensionFromClassic).toBeNull();
    expect(store.forceContinue).toBe(false);
  });

  it("follows Classic's dropdown when it names one: Continue Asc., or any build for Prestige Now", () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    store.setFirstAscension('continue');
    planner.planVariantOverrides = { 0: '2-sale' };
    expect(store.firstAscension).toBe('fresh');
    expect(store.firstAscensionFromClassic).toBe('fresh');
    planner.planVariantOverrides = { 0: 'continue' };
    expect(store.firstAscension).toBe('continue');
    // A later ascension's pick says nothing about the first.
    planner.planVariantOverrides = { 1: '1-sale' };
    expect(store.firstAscension).toBe('continue');
    // Classic's Generate clears every pick: Your setup's choice is what is left.
    planner.planVariantOverrides = {};
    store.setFirstAscension('fresh');
    planner.planVariantOverrides = {};
    expect(store.firstAscension).toBe('fresh');
  });

  it("writes Classic's pick: Continue sets it, Fastest clears it, Prestige now clears only a Continue", () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    planner.planVariantOverrides = { 2: '3-sale' };
    store.setFirstAscension('continue', { rebuildClassic: true });
    expect(planner.planVariantOverrides).toEqual({ 0: 'continue', 2: '3-sale' });
    expect(store.classicFirstPickChanged).toBe(true);
    store.classicFirstPickChanged = false;

    store.setFirstAscension('fresh', { rebuildClassic: true });
    expect(planner.planVariantOverrides).toEqual({ 2: '3-sale' });
    expect(store.firstAscension).toBe('fresh');
    expect(store.classicFirstPickChanged).toBe(true);
    store.classicFirstPickChanged = false;

    // A build picked in Classic already means Prestige Now: it stays, and nothing needs rebuilding.
    planner.planVariantOverrides = { 0: '1-sale-tier13' };
    store.setFirstAscension('fresh', { rebuildClassic: true });
    expect(planner.planVariantOverrides[0]).toBe('1-sale-tier13');
    expect(store.classicFirstPickChanged).toBe(false);

    store.setFirstAscension('auto');
    expect(planner.planVariantOverrides).toEqual({});
    expect(store.firstAscension).toBe('auto');
  });

  it("gives Classic's Generate the pick to keep: Continue, or the build an applied answer took", () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    expect(store.classicFirstPick()).toEqual({});
    store.setFirstAscension('continue');
    expect(store.classicFirstPick()).toEqual({ 0: 'continue' });

    store.setFirstAscension('fresh');
    store.applyChain([220, 490], false, {
      legs: [
        { key: '2-sale-tier13', endTE: 220 },
        { key: '1-sale', endTE: 490 },
      ] as never,
    });
    expect(planner.targetTE).toBe('220 490');
    expect(store.classicFirstPick()).toEqual({ 0: '2-sale-tier13' });
    // Not under another setting than the one it was priced under, nor for another chain typed since.
    store.setFirstAscension('continue');
    expect(store.classicFirstPick()).toEqual({ 0: 'continue' });
    store.setFirstAscension('fresh');
    planner.targetTE = '230 490';
    expect(store.classicFirstPick()).toEqual({});

    // Under Continue, the search may have taken a fresh build (continuing took over a week, and the
    // build was strictly faster): no pick, so Classic takes its fastest, that build, and the setting
    // stays Continue rather than reading a build pick back as Prestige Now.
    store.setFirstAscension('continue');
    store.applyChain([230, 490], false, { legs: [{ key: '1-sale', endTE: 230 }] as never });
    expect(store.classicFirstPick()).toEqual({});
    store.applyChain([230, 490], false, { legs: [{ key: 'continue', endTE: 230 }] as never });
    expect(store.classicFirstPick()).toEqual({ 0: 'continue' });
  });

  it('puts a sweep’s setting back exactly, Classic’s pick included', () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    planner.planVariantOverrides = { 0: '2-sale' };
    const before = store.firstAscensionState();
    store.setFirstAscension('continue');
    expect(planner.planVariantOverrides[0]).toBe('continue');
    store.restoreFirstAscension(before);
    expect(planner.planVariantOverrides[0]).toBe('2-sale');
    expect(store.firstAscensionChoice).toBe('auto');
  });

  it('keeps the old boolean working for older callers', () => {
    const store = useChainSearchStore();
    store.forceContinue = true;
    expect(store.firstAscension).toBe('continue');
    store.forceContinue = false;
    expect(store.firstAscension).toBe('auto');
  });
});

describe("Classic's one-hour rule", () => {
  /** Set the planner's start `seconds` from now, in its own zone. */
  function startIn(seconds: number): number {
    const planner = useAutoPlannerStore();
    const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const at = Math.floor(Date.now() / 1000) + seconds;
    const [d, t] = formatInZone(at, tz).split(' ');
    planner.startDate = d;
    planner.startTime = t;
    return at;
  }

  it('prices a plan starting more than an hour from now with a fresh first ascension', () => {
    const store = useChainSearchStore();
    store.setFirstAscension('continue');
    startIn(3 * 3600);
    expect(store.firstAscensionFor()).toBe('fresh');
    expect(store.resumeInputsKey.split('|')[4]).toBe('fresh');
    // The setting itself is untouched: Your setup still says Continue.
    expect(store.firstAscension).toBe('continue');
  });

  it('keeps the setting for a plan starting now, or within the hour', () => {
    const store = useChainSearchStore();
    store.setFirstAscension('continue');
    expect(store.firstAscensionFor()).toBe('continue');
    expect(store.resumeInputsKey.split('|')[4]).toBe('fc');
    startIn(20 * 60);
    expect(store.firstAscensionFor()).toBe('continue');
    store.setFirstAscension('auto');
    expect(store.resumeInputsKey.split('|')[4]).toBe('auto');
  });

  it('leaves a run being carried on (its start pinned) on the setting it was priced under', () => {
    const store = useChainSearchStore();
    store.setFirstAscension('continue');
    store.pinPlanStart(Math.floor(Date.now() / 1000) + 5 * 86400);
    expect(store.firstAscensionFor()).toBe('continue');
  });

  it('is not applied on the command line, where a run must not depend on the clock', () => {
    const store = useChainSearchStore();
    store.setFirstAscension('continue');
    startIn(3 * 86400);
    store.continueStartRule = false;
    expect(store.firstAscensionFor()).toBe('continue');
  });
});

describe('a run started under the old boolean carries on as it began', () => {
  const SAVE_AT = 1_790_000_000;
  const PLAN_START = SAVE_AT + 600;

  function loadSave(te: number): Record<string, unknown> {
    const iss = useInitialStateStore();
    const c = Math.min(98, te);
    const earned = { curiosity: c, integrity: te - c, humility: 0, resilience: 0, kindness: 0 };
    const raw = { approxTime: SAVE_AT, farms: [], virtue: { eovEarned: [c, te - c, 0, 0, 0] }, game: {} };
    iss.rawBackup = raw as never;
    iss.initialTeEarned = earned;
    iss.epicResearchLevels = { cheaper_research: 1 } as never;
    const a = useActionsStore();
    a.actions[0].endState = { ...a.actions[0].endState, teEarned: earned };
    a._initialSnapshot = { ...a.initialSnapshot, teEarned: earned };
    return raw;
  }

  it('a checkpoint and stored inputs with forceContinue true resume as Continue Asc., whatever the default', async () => {
    const store = useChainSearchStore();
    const raw = loadSave(196);
    expect(store.currentTE).toBe(196);
    // Exactly what the build before 9 Oct stored: the boolean, no firstAscension.
    const kept = await saveRunInputs('P', {
      context: { rawBackup: raw },
      baseState: {},
      currentFarmState: null,
      planStart: PLAN_START,
      currentTE: 196,
      final: 490,
      forceContinue: true,
    } as never);
    await saveCheckpoint(
      'P',
      buildCheckpoint({
        fingerprint: `P|${PLAN_START}|196|490|fc`,
        effort: 'thorough',
        seedChain: [200, 490],
        bestChain: [200, 490],
        bestSeconds: 700 * 86400,
        entries: [{ key: '200,490', seconds: 700 * 86400, legs: [] }],
        stage: 'running',
        detail: '',
        chainsDone: 1,
        space: {
          mode: 'range',
          minAscensions: 2,
          maxAscensions: 2,
          minGap: 0,
          range: { lo: 200, hi: 200, step: 1 },
          chains: 1,
          chainsPriced: 1,
          stoppedEarly: true,
        },
        inputsKey: kept.key,
      })
    );
    expect(store.firstAscension).toBe('auto');

    await store.checkResumable('P');
    expect(store.crashedRun).not.toBeNull();
    expect(await store.resumeCrashedRun('P')).toBe(true);

    expect(store.firstAscension).toBe('continue');
    expect(useAutoPlannerStore().planVariantOverrides[0]).toBe('continue');
    expect(store.resumeInputsKey).toBe('|0|196|490|fc');
    // Its record says what it priced: the submission names Continue Asc., with the boolean beside it.
    const sub = store.buildRunSubmission();
    expect(sub?.firstAscension).toBe('continue');
    expect(sub?.forceContinue).toBe(true);
  });
});
