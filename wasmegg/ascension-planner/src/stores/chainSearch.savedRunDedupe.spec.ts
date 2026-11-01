/**
 * Saved runs keep one entry per run (red team R7, finding 5: "Save this run" three times gave three identical rows,
 * and 25 clicks left 20 identical rows, pushing every other saved run out). The same run saved again (same kind and
 * effort, same target and route, same save and inputs: search/runLibrary.ts `runIdentity`) refreshes the entry already
 * there; duplicates already stored collapse when the list is read; the button says Saved ✓ for the run on screen.
 * The same rule as Saved answers (lib/savedAnswerIdentity.ts). Fixed clock, placeholder data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { useChainSearchStore } = await import('./chainSearch');
const { saveRun, listRuns, loadRun, MAX_RUNS } = await import('@/search/runLibrary');
const { hashID } = await import('@/lib/storage/db');
const { renderHtml, textOf } = await import('@/test/renderComponent');
const SavedRuns = (await import('@/components/auto/SavedRuns.vue')).default;

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

const PLAYER = 'EI1234567890123456';
const T0 = Date.UTC(2026, 9, 31, 16, 8); // Oct 31, 2026, 4:08 PM UTC

function at(ms: number): void {
  vi.setSystemTime(ms);
}

/** The run on screen: a finished Fast result. */
function showRun(store: ReturnType<typeof useChainSearchStore>, chain = [195, 229, 283, 490], days = 743.9): void {
  store.bestChain = chain;
  store.bestDays = days;
}

/** A stored run, as the library keeps it (the shape `saveCurrentRun` writes). */
function stored(over: Partial<Parameters<typeof saveRun>[1]> = {}) {
  return {
    label: '490 TE · 4 asc · 743.9 d',
    currentTE: 147,
    finalTE: 490,
    effort: 'balanced',
    seedChain: [],
    bestChain: [195, 229, 283, 490],
    bestDays: 743.9,
    entries: [{ key: '195,229,283,490', seconds: 743.9 * 86400, legs: [] }],
    bestLegs: [],
    runLog: [],
    complete: true,
    fingerprint: 'fp|1793462880|147|490',
    inputsKey: 'save-key-1',
    ...over,
  };
}

describe('Saved runs: one entry per run', () => {
  beforeEach(() => {
    db.clear();
    installStorageStub();
    vi.useFakeTimers({ toFake: ['Date'] });
    at(T0);
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Save this run three times: one row, its time refreshed, its name kept', async () => {
    const store = useChainSearchStore();
    showRun(store);
    await store.saveCurrentRun(PLAYER, 'Placeholder run');
    at(T0 + 60_000);
    await store.saveCurrentRun(PLAYER);
    at(T0 + 120_000);
    await store.saveCurrentRun(PLAYER, '');
    expect(store.savedRuns).toHaveLength(1);
    expect(store.savedRuns[0]).toMatchObject({ label: 'Placeholder run', savedAt: T0 + 120_000 });
    expect(await listRuns(await hashID(PLAYER))).toHaveLength(1);
  });

  it('a name typed on a re-save renames it', async () => {
    const store = useChainSearchStore();
    showRun(store);
    await store.saveCurrentRun(PLAYER, 'First name');
    await store.saveCurrentRun(PLAYER, 'New name');
    expect(store.savedRuns.map(r => r.label)).toEqual(['New name']);
  });

  it('25 clicks keep one row and evict nothing else', async () => {
    const hash = await hashID(PLAYER);
    for (let i = 0; i < MAX_RUNS - 1; i++) {
      await saveRun(
        hash,
        stored({ id: `other${i}`, bestChain: [200 + i, 490], label: `other ${i}`, now: T0 - 1e6 + i })
      );
    }
    const store = useChainSearchStore();
    showRun(store);
    for (let i = 0; i < 25; i++) {
      at(T0 + i * 1000);
      await store.saveCurrentRun(PLAYER);
    }
    expect(store.savedRuns).toHaveLength(MAX_RUNS);
    const mine = store.savedRuns.filter(r => r.bestChain.join(' ') === '195 229 283 490');
    expect(mine).toHaveLength(1);
    expect(store.savedRuns.filter(r => r.id.startsWith('other'))).toHaveLength(MAX_RUNS - 1);
  });

  it('a different route, target, effort or save stays a separate row', async () => {
    const store = useChainSearchStore();
    showRun(store);
    await store.saveCurrentRun(PLAYER);
    showRun(store, [195, 230, 283, 490]);
    await store.saveCurrentRun(PLAYER);
    showRun(store, [195, 229, 283, 480]);
    await store.saveCurrentRun(PLAYER);
    showRun(store);
    store.effort = 'thorough' as never;
    await store.saveCurrentRun(PLAYER);
    expect(store.savedRuns).toHaveLength(4);

    const hash = await hashID(PLAYER);
    await saveRun(hash, stored({ now: T0 }));
    await saveRun(hash, stored({ now: T0 + 1, inputsKey: 'save-key-2' }));
    await saveRun(hash, stored({ now: T0 + 2, fingerprint: 'fp|1793466480|147|490' })); // another plan start
    expect((await listRuns(hash)).filter(r => r.label === '490 TE · 4 asc · 743.9 d' && r.inputsKey)).toHaveLength(3);
  });

  it('duplicates already stored collapse when the list is read, keeping the first name, bodies of the rest gone', async () => {
    const hash = await hashID(PLAYER);
    // What the R7 build stored after three clicks and one other run: the rows as the old code wrote them.
    const row = (id: string, label: string, savedAt: number, bestChain = [195, 229, 283, 490]) => ({
      ...stored({ bestChain, label }),
      id,
      version: 2,
      savedAt,
      chainsPriced: 1,
      entries: undefined,
      bestLegs: undefined,
      runLog: undefined,
    });
    const indexKey = `${hash}/chainSearchLibraryIndex`;
    db.set(indexKey, [
      row('d', 'again', T0 + 3000),
      row('c', 'again', T0 + 2000),
      row('b', 'other', T0 + 1000, [195, 230, 283, 490]),
      row('a', 'first', T0),
    ]);
    for (const id of ['a', 'b', 'c', 'd'])
      db.set(`${hash}/chainSearchLibraryRun:${id}`, { version: 2, entries: [], bestLegs: [], runLog: [] });
    const store = useChainSearchStore();
    await store.refreshSavedRuns(PLAYER);
    expect(store.savedRuns.map(r => r.label).sort()).toEqual(['first', 'other']);
    expect(await listRuns(hash)).toHaveLength(2);
    expect((db.get(indexKey) as unknown[]).length).toBe(2);
    const keptIds = store.savedRuns.map(r => r.id);
    const gone = ['a', 'c', 'd'].filter(i => !keptIds.includes(i));
    expect(gone).toHaveLength(2);
    for (const id of gone) expect(await loadRun(hash, id)).toBeNull();
  });

  // Following is per goal and route (stores/follow.ts `isFollowed(goalKey, chain)`; SavedRuns.vue passes
  // `fastest-${finalTE}` and the run's route), not per entry: the row left names the same goal and route.
  it('keeps the Following mark: the row left names the same goal and route', async () => {
    const store = useChainSearchStore();
    showRun(store);
    await store.saveCurrentRun(PLAYER);
    const followKey = (r: (typeof store.savedRuns)[number]) => `fastest-${r.finalTE}|${r.bestChain.join(' ')}`;
    const before = followKey(store.savedRuns[0]);
    await store.saveCurrentRun(PLAYER);
    expect(store.savedRuns).toHaveLength(1);
    expect(followKey(store.savedRuns[0])).toBe(before);
  });

  it('Save this run says Saved ✓ once the run on screen is saved, and not for a new one', async () => {
    const store = useChainSearchStore();
    showRun(store);
    expect(store.currentRunSaved).toBe(false);
    await store.saveCurrentRun(PLAYER);
    expect(store.currentRunSaved).toBe(true);
    const pinia = (await import('pinia')).getActivePinia()!;
    const text = textOf(await renderHtml(SavedRuns, { playerId: PLAYER }, {}, [pinia]));
    expect(text).toContain('Saved ✓');
    expect(text).not.toContain('Save this run');
    showRun(store, [195, 230, 283, 490]);
    expect(store.currentRunSaved).toBe(false);
  });

  it('genuinely different runs still evict the oldest first at the cap (no pinned or followed exemption exists)', async () => {
    const hash = await hashID(PLAYER);
    for (let i = 0; i <= MAX_RUNS; i++) {
      await saveRun(hash, stored({ bestChain: [200 + i, 490], label: `run ${i}`, now: T0 + i }));
    }
    const list = await listRuns(hash);
    expect(list).toHaveLength(MAX_RUNS);
    expect(list.some(r => r.label === 'run 0')).toBe(false);
    expect(list.some(r => r.label === 'run 1')).toBe(true);
  });
});
