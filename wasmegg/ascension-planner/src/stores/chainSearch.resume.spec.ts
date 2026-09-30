import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => void db.set(`${hash}/${key}`, value)),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

const { useChainSearchStore } = await import('./chainSearch');
const { useAutoPlannerStore } = await import('./autoPlanner');
const { buildCheckpoint, saveCheckpoint } = await import('@/search/persistence');
const { saveRunInputs } = await import('@/search/runSaves');

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

const PRICED_AT = 1_790_000_123;

/** An unfinished exhaustive run's checkpoint. `currentTE` reads 0 here (no backup loaded), and the
 *  store's defaults add nothing past `fc`, so `P|<start>|0|490|fc` is what the store would write. */
async function crashed(fingerprint: string, inputsKey?: string): Promise<void> {
  await saveCheckpoint(
    'P',
    buildCheckpoint({
      fingerprint,
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
      inputsKey,
    })
  );
}

/**
 * The overnight run lost at 39,904 of 58,459 chains: no plan start was set, so the plan was timed
 * from page load, the reload moved it, and the checkpoint could never be matched again.
 */
describe('chainSearch: resuming after a reload', () => {
  beforeEach(() => {
    db.clear();
    installStorageStub();
    setActivePinia(createPinia());
  });

  it('offers a run priced under an earlier "now", and says the start goes back', async () => {
    const store = useChainSearchStore();
    expect(store.planStartIsNow).toBe(true);
    await crashed(`P|${PRICED_AT}|0|490|fc`);

    await store.checkResumable('P');
    expect(store.crashedRun).not.toBeNull();
    expect(store.blockedCheckpoint).toBeNull();
    // Shown in the player's chosen date style (lib/displayTime.ts): the run's own day, whichever.
    expect(store.planStartRestoreNote(store.crashedRun?.fingerprint)).toMatch(/2026/);
  });

  it('pins the start to the second, and lets go when the player types a different one', async () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    store.pinPlanStart(PRICED_AT);
    expect(store.planStart).toBe(PRICED_AT);
    expect(store.planStartIsNow).toBe(false);
    expect(planner.startDate).not.toBe('');
    await nextTick();
    expect(store.planStart).toBe(PRICED_AT); // the boxes hold minutes; the pin survives them

    planner.startTime = planner.startTime === '03:00' ? '04:00' : '03:00';
    await nextTick();
    expect(store.planStart).not.toBe(PRICED_AT);
  });

  it('lets go when the player clears the start, rather than timing later runs from yesterday', async () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    store.pinPlanStart(PRICED_AT);
    await nextTick();
    planner.startDate = '';
    await nextTick();
    expect(store.planStartIsNow).toBe(true);
    expect(store.planStart).not.toBe(PRICED_AT);
  });

  it('offers a run on a different TE when its own save was kept: it carries on with that save', async () => {
    const store = useChainSearchStore();
    const kept = await saveRunInputs('P', {
      context: { rawBackup: { approxTime: 1_790_640_095 } },
      baseState: {},
      currentFarmState: null,
      planStart: PRICED_AT,
      currentTE: 147,
      final: 490,
      forceContinue: true,
    } as never);
    await crashed(`P|${PRICED_AT}|147|490|fc`, kept.key);

    await store.checkResumable('P');
    expect(store.crashedRun?.inputsKey).toBe(kept.key);
    expect(store.blockedCheckpoint).toBeNull();
    expect(store.runSaveFor(kept.key)).toMatchObject({ te: 147, backupAt: 1_790_640_095 });
  });

  it("never offers another account's run, even under the same player id (Kelli's account, 30 Sept)", async () => {
    const store = useChainSearchStore();
    const theirs = await saveRunInputs('P', {
      context: { rawBackup: { approxTime: 1_790_640_095, eiUserId: 'EI1111111111111111' } },
      baseState: {},
      currentFarmState: null,
      planStart: PRICED_AT,
      currentTE: 147,
      final: 490,
      forceContinue: true,
    } as never);
    await crashed(`P|${PRICED_AT}|147|490|fc`, theirs.key);
    // The save loaded now is a different account's.
    const { useInitialStateStore } = await import('./initialState');
    useInitialStateStore().rawBackup = { eiUserId: 'EI2222222222222222' } as never;

    await store.checkResumable('P');
    expect(store.crashedRun).toBeNull();
    expect(store.blockedCheckpoint).toBeNull();
    expect(store.otherAccountKeys.has(theirs.key)).toBe(true);

    // The same account's save: offered as before.
    useInitialStateStore().rawBackup = { eiUserId: 'EI1111111111111111' } as never;
    await store.checkResumable('P');
    expect(store.crashedRun?.inputsKey).toBe(theirs.key);
  });

  it('still offers a run whose settings differ, and says it will put them back', async () => {
    // Priced with a 480 target and a week off; the panel now says 490 and no time off.
    const store = useChainSearchStore();
    await crashed(`P|${PRICED_AT}|0|480|fc|off:1795000000-1795600000`);
    await store.checkResumable('P');
    expect(store.crashedRun).not.toBeNull();
    expect(store.blockedCheckpoint).toBeNull();
    expect(store.settingsRestoreNote(store.crashedRun?.fingerprint)).toMatch(/final target was 480.*time off/);
  });

  it('refuses a run priced on a stale save, and says what moved', async () => {
    const store = useChainSearchStore();
    await crashed(`P|${PRICED_AT}|147|490|fc`);

    await store.checkResumable('P');
    expect(store.crashedRun).toBeNull();
    expect(store.blockedCheckpoint?.changes).toEqual(['TE was 147, now 0']);
  });
});
