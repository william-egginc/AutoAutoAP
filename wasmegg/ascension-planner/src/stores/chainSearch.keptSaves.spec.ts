/**
 * Saved answers and Saved runs bring back the save they were priced from (search/keptSaves.ts): saving
 * an entry keeps that save, one copy for many entries; "Use the save from…" makes it the planner's
 * active save; "Load a save file" reads a downloaded one; entries without one say why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

/** The save loader, standing in: the planner's save becomes the one handed over. */
const loader = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/modes/planFuture', async () => {
  const { useInitialStateStore } = await import('./initialState');
  return {
    initPlanFuture: async (_playerId: string, stored?: unknown) => {
      loader.calls.push(stored);
      useInitialStateStore().rawBackup = stored as never;
    },
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');
const { useUIStore } = await import('./ui');
const { saveRunInputs, listRunSaves } = await import('@/search/runSaves');
const { listKeptSaves, backupText } = await import('@/search/keptSaves');
const { saveRun } = await import('@/search/runLibrary');
const { saveDeadlineResult } = await import('@/search/deadlineStore');

/** See chainSearch.seed.spec.ts: the actions store reads localStorage the moment it exists. */
function installStorageStub(): void {
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
}

const SAVED_AT = 1_791_430_784; // the old save's moment
const PLAN_START = SAVED_AT + 2 * 3600;

function backup(at: number, account = 'TEST-ACCOUNT-1') {
  return {
    userName: 'Synthetic',
    eiUserId: account,
    approxTime: at,
    game: { soulEggsD: 1e24, permitLevel: 1 },
    farms: [{ habs: [1, 2, 3, 4] }],
    virtue: { eovEarned: [10, 20, 30, 40, 50] },
  };
}

function answer(over: Record<string, unknown> = {}) {
  return {
    routes: [{ chain: [240, 255], reachAt: 0, ascendAt: 0, spare: 3600, legs: [] }],
    byStops: [],
    deadline: PLAN_START + 30 * 86400,
    planStart: PLAN_START,
    te: 230,
    step: 1,
    shapes: 1,
    priced: 1,
    stoppedEarly: false,
    ascendNeeded: false,
    lastHi: 276,
    at: Date.now(),
    ...over,
  } as never;
}

/** The run's own stored payload, as a By a date or Fastest run keeps it while it runs. */
async function runSave(at = SAVED_AT): Promise<string> {
  const kept = await saveRunInputs('P', {
    context: { rawBackup: backup(at) },
    baseState: {},
    currentFarmState: null,
    planStart: PLAN_START,
    currentTE: 230,
    final: 490,
  } as never);
  return kept.key;
}

/** Past the quarter hour in which an unnamed save is kept regardless (another tab's). */
function later(minutes: number): void {
  vi.setSystemTime(Date.now() + minutes * 60_000);
}

describe('chainSearch: saves kept for saved entries', () => {
  beforeEach(() => {
    db.clear();
    loader.calls = [];
    installStorageStub();
    vi.useFakeTimers({ toFake: ['Date'] });
    setActivePinia(createPinia());
  });
  afterEach(() => vi.useRealTimers());

  it('Save this answer keeps the save it was priced from, one copy for many answers', async () => {
    const store = useChainSearchStore();
    const key = await runSave();
    store.deadlineResult = answer({ inputsKey: key, backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'first');
    await store.saveCurrentAnswer('P', 'second');
    const [a, b] = store.savedAnswers;
    expect(a.save).toMatchObject({ te: 230, backupAt: SAVED_AT });
    expect(b.save?.key).toBe(a.save?.key);
    expect(await listKeptSaves('P')).toHaveLength(1);
    expect(store.entrySaveState(a)).toBe('kept');
  });

  it("finds the save from the one loaded now when the run's own copy is gone", async () => {
    const store = useChainSearchStore();
    useInitialStateStore().rawBackup = backup(SAVED_AT) as never;
    store.deadlineResult = answer({ inputsKey: 'gone', backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'from the loaded save');
    expect(store.entrySaveState(store.savedAnswers[0])).toBe('kept');
  });

  it('says why when there is no save: gone before it was saved, or saved before saves were kept', async () => {
    const store = useChainSearchStore();
    useInitialStateStore().rawBackup = backup(SAVED_AT + 86400) as never; // the game has moved on
    store.deadlineResult = answer({ backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'too late');
    expect(store.savedAnswers[0].save).toBeNull();
    expect(store.entrySaveState(store.savedAnswers[0])).toBe('missing');
    expect(store.entrySaveState({})).toBe('before');
    expect(store.entrySaveState({ save: { key: 'dropped', te: 1, backupAt: 1 } })).toBe('dropped');
  });

  it('drops a kept save when no saved answer or run names it, and not before', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer({ inputsKey: await runSave(), backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'one');
    await store.saveCurrentAnswer('P', 'two');
    const save = store.savedAnswers[0].save!;
    // A saved run naming the same save.
    await saveRun('P', {
      label: 'run',
      currentTE: 230,
      finalTE: 490,
      effort: 'thorough',
      seedChain: [490],
      bestChain: [300, 490],
      bestDays: 400,
      entries: [],
      bestLegs: [],
      runLog: [],
      complete: true,
      save,
    });
    later(20);
    await store.removeSavedAnswer('P', store.savedAnswers[0].id);
    await store.removeSavedAnswer('P', store.savedAnswers[0].id);
    expect(await listKeptSaves('P')).toHaveLength(1); // the run still names it
    await store.refreshSavedRuns('P');
    await store.deleteSavedRun('P', store.savedRuns[0].id);
    expect(await listKeptSaves('P')).toHaveLength(0);
  });

  it('Use the save makes it the active save, from the answer’s own plan start, and says so', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer({ inputsKey: await runSave(), backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'Egg Day');
    const a = store.savedAnswers[0];
    useInitialStateStore().rawBackup = backup(SAVED_AT + 5 * 86400) as never; // latest, since

    expect(
      await store.useEntrySave('P', { label: a.label, save: a.save, planStart: a.result.planStart, settings: undefined })
    ).toBe(true);
    expect(loader.calls).toHaveLength(1);
    expect((loader.calls[0] as { approxTime: number }).approxTime).toBe(SAVED_AT);
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'entry', te: 230, backupAt: SAVED_AT, label: 'Egg Day' });
    expect(store.planStart).toBe(PLAN_START);
    // The account anything sent from here carries: that save's own moment, so the board sees its age.
    expect((useInitialStateStore().rawBackup as { approxTime: number }).approxTime).toBe(SAVED_AT);
  });

  it('a send from a picked save carries that save\'s real age, not the latest save\'s', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer({ inputsKey: await runSave(), backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'Egg Day');
    const a = store.savedAnswers[0];
    useInitialStateStore().rawBackup = backup(SAVED_AT + 5 * 86400) as never;
    await store.useEntrySave('P', { label: a.label, save: a.save, planStart: a.result.planStart });
    // A new answer worked out on the picked save (no account of its own kept): what is sent with it.
    const fresh = answer({ planStart: store.planStart });
    const route = { chain: [240, 255], reachAt: store.planStart + 86400, ascendAt: 0, spare: 0, legs: [] };
    const sub = store.buildDeadlineSubmission(route as never, undefined, fresh);
    expect(sub?.backupAgeHours).toBe(2); // the plan starts 2 h after the save it was made from
  });

  it('downloads the full save under a name with no player id', async () => {
    const store = useChainSearchStore();
    store.deadlineResult = answer({ inputsKey: await runSave(), backupAt: SAVED_AT });
    await store.saveCurrentAnswer('P', 'keep me');
    const file = await store.entrySaveFile('P', store.savedAnswers[0].save!);
    expect(file?.name).toMatch(/^egg-inc-save-TE230-.*\.json$/);
    expect(file?.text).toBe(backupText(backup(SAVED_AT)));
  });

  it("Load a save file loads the player's own save, and refuses another account's", async () => {
    const store = useChainSearchStore();
    useInitialStateStore().rawBackup = backup(SAVED_AT + 86400) as never;
    expect(await store.loadSaveFile('P', JSON.stringify(backup(SAVED_AT, 'TEST-ACCOUNT-2')))).toBe(false);
    expect(store.olderSaveError).toMatch(/another account/);
    expect(await store.loadSaveFile('P', 'nonsense')).toBe(false);
    expect(store.olderSaveError).toMatch(/isn't JSON/);

    expect(await store.loadSaveFile('P', JSON.stringify(backup(SAVED_AT)))).toBe(true);
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'file', backupAt: SAVED_AT });
    // From that point in time: the save's own moment.
    expect(store.planStart).toBe(SAVED_AT);
  });

  it("keeps the last By a date result's run save until a newer result replaces it, so it can still be saved", async () => {
    const store = useChainSearchStore();
    const key = await runSave();
    await saveDeadlineResult('P', answer({ inputsKey: key, backupAt: SAVED_AT }));
    later(20);
    await store.checkResumable('P');
    expect((await listRunSaves('P')).map(s => s.key)).toContain(key);
  });
});
