/**
 * The ordering bug this composable exists to survive: the first pass runs before the backup has
 * loaded, and the placeholder it writes must not become the reason the backup is ignored.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useBackupPlanStart, resetBackupPlanStart, planStartOwner, setPlanStartOwner } from './useBackupPlanStart';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';

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

/** 2026-09-17 21:21 in UTC, the shape of a backup taken the night before. */
const BACKUP = Math.floor(Date.UTC(2026, 8, 17, 21, 21) / 1000);

describe('useBackupPlanStart', () => {
  beforeEach(() => {
    installStorageStub();
    setActivePinia(createPinia());
    resetBackupPlanStart();
  });

  const setup = () => {
    const auto = useAutoPlannerStore();
    auto.timezone = 'UTC';
    const initial = useInitialStateStore();
    return { auto, initial };
  };

  it('starts now when a backup is already loaded, not at the backup', () => {
    vi.useFakeTimers();
    vi.setSystemTime((BACKUP + 5 * 3600) * 1000);
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP } as never;
    useBackupPlanStart();
    expect(auto.startDate).toBe('2026-09-18');
    expect(auto.startTime).toBe('02:21');
    vi.useRealTimers();
  });

  // The regression. Mounting before the backup arrives wrote "now" into the form; the backup then
  // landed EARLIER than that value, which resolvePlanStart treats as the player's own choice to
  // start later -- so the plan was timed from the page load instead of from the save.
  it('replaces its own placeholder when the backup arrives afterwards', async () => {
    const { auto, initial } = setup();
    useBackupPlanStart();
    const placeholder = { date: auto.startDate, time: auto.startTime };
    expect(placeholder.date).not.toBe('');

    // Now, again, rather than the backup: the placeholder was not a choice, and the default is now.
    vi.useFakeTimers();
    vi.setSystemTime((BACKUP + 5 * 3600) * 1000);
    initial.rawBackup = { approxTime: BACKUP } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-09-18');
    expect(auto.startTime).toBe('02:21');
    vi.useRealTimers();
  });

  // A newer save loaded later in the same session (the header's refresh) used to be ignored once a
  // default was taken, leaving the start before the farm state it priced (5 Oct).
  it('moves a start that a newer save has overtaken up to now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime((BACKUP + 3600) * 1000);
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP } as never;
    useBackupPlanStart();
    expect(auto.startTime).toBe('22:21');

    vi.setSystemTime((BACKUP + 4 * 3600) * 1000);
    initial.rawBackup = { approxTime: BACKUP + 3 * 3600 } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-09-18');
    expect(auto.startTime).toBe('01:21');
    vi.useRealTimers();
  });

  it('keeps a typed start that is still after a newer save', async () => {
    vi.useFakeTimers();
    vi.setSystemTime((BACKUP + 3600) * 1000);
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP } as never;
    useBackupPlanStart();
    auto.startDate = '2026-12-25';
    auto.startTime = '08:00';
    initial.rawBackup = { approxTime: BACKUP + 3 * 3600 } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-12-25');
    expect(auto.startTime).toBe('08:00');
    vi.useRealTimers();
  });

  // The other half: a start the player typed is a decision, and "I will begin tomorrow morning" is
  // a legitimate thing to ask for. Only the untouched placeholder is replaceable.
  it('leaves a start the player typed alone, even though it is later than the backup', async () => {
    const { auto, initial } = setup();
    useBackupPlanStart();
    auto.startDate = '2026-12-25';
    auto.startTime = '08:00';

    initial.rawBackup = { approxTime: BACKUP } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-12-25');
    expect(auto.startTime).toBe('08:00');
  });

  it('only takes a default once, so a later refresh does not overwrite a chosen start', async () => {
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP } as never;
    useBackupPlanStart();
    auto.startDate = '2026-12-25';
    auto.startTime = '08:00';

    initial.rawBackup = { approxTime: BACKUP + 86400 } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-12-25');
  });

  it('ignores a backup with no usable timestamp rather than syncing to the epoch', async () => {
    const { auto, initial } = setup();
    useBackupPlanStart();
    const placeholder = auto.startDate;
    initial.rawBackup = { approxTime: 0 } as never;
    await nextTick();
    expect(auto.startDate).toBe(placeholder);
  });
});

/**
 * The start belongs to one account (red team 21 Oct 2026, data-inputs #10): a save stamped in 2100 left
 * "Plan starts Dec 31, 2099" on every later save, and account A's start carried over to account B.
 * Joo's override rework (fcc9e764) stopped a reload bringing back a start nobody chose, but not these:
 * within a visit, and for an override, the start was still one for every account.
 */
describe('the plan start per account', () => {
  const A = 'EI1234567890123456';
  const B = 'EI0000000000000000';
  beforeEach(() => {
    installStorageStub();
    setActivePinia(createPinia());
    resetBackupPlanStart();
    vi.useFakeTimers();
    vi.setSystemTime((BACKUP + 3600) * 1000);
  });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const auto = useAutoPlannerStore();
    auto.timezone = 'UTC';
    return { auto, initial: useInitialStateStore() };
  };

  it('a save from the future counts as now, so a normal save after it is not dated 2099', async () => {
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: 4102444800, eiUserId: A } as never;
    useBackupPlanStart();
    expect(auto.startDate).toBe('2026-09-17');
    expect(auto.startTime).toBe('22:21');
    initial.rawBackup = { approxTime: BACKUP, eiUserId: A } as never;
    await nextTick();
    expect(auto.startDate).toBe('2026-09-17');
  });

  it("another account's save drops the start and its override, and starts now", async () => {
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP, eiUserId: A } as never;
    useBackupPlanStart();
    auto.startTimeOverride = true;
    auto.startDate = '2026-12-25';
    auto.startTime = '08:00';
    expect(planStartOwner()).not.toBe('');
    expect(planStartOwner()).not.toContain(A);

    initial.rawBackup = { approxTime: BACKUP, eiUserId: B } as never;
    await nextTick();
    expect(auto.startTimeOverride).toBe(false);
    expect([auto.startDate, auto.startTime]).toEqual(['2026-09-17', '22:21']);
  });

  it("the same account's newer save keeps an override", async () => {
    const { auto, initial } = setup();
    initial.rawBackup = { approxTime: BACKUP, eiUserId: A } as never;
    useBackupPlanStart();
    auto.startTimeOverride = true;
    auto.startDate = '2026-12-25';
    auto.startTime = '08:00';
    initial.rawBackup = { approxTime: BACKUP + 60, eiUserId: A } as never;
    await nextTick();
    expect(auto.startTimeOverride).toBe(true);
    expect(auto.startDate).toBe('2026-12-25');
  });

  it('an override restored from the browser for one account is dropped when another account loads', async () => {
    const { auto, initial } = setup();
    // What usePlanStartForm restores from the cache, owner included.
    initial.rawBackup = { approxTime: BACKUP, eiUserId: A } as never;
    useBackupPlanStart();
    const ownerA = planStartOwner();
    setActivePinia(createPinia());
    resetBackupPlanStart();
    const again = setup();
    again.auto.startTimeOverride = true;
    again.auto.startDate = '2026-12-25';
    again.auto.startTime = '08:00';
    setPlanStartOwner(ownerA);
    again.initial.rawBackup = { approxTime: BACKUP, eiUserId: B } as never;
    useBackupPlanStart();
    await nextTick();
    expect(again.auto.startTimeOverride).toBe(false);
    expect(again.auto.startDate).toBe('2026-09-17');
    void auto;
    void initial;
  });
});
