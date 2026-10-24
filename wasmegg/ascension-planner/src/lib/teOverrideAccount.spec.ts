/**
 * Joo's starting-TE override (fcc9e764) follows the account loaded: switching saves never carries one
 * account's override to another, and switching back finds it again without a reload (spec-joo-fcc9).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { syncTEOverrideToAccount } from './teOverrideAccount';
import { saveAutoPlannerTEInputs, loadAutoPlannerTEOverride } from './autoPlannerFormCache';
import { sanitizeTEOverride } from './loadoutInputsGuard';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';

const ID_A = 'EI' + '1234567890123456';
const ID_B = 'EI' + '6543210987654321';
const TE_A = { curiosity: 30, integrity: 31, humility: 32, resilience: 33, kindness: 34 };

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

function load(id: string): void {
  const s = useInitialStateStore();
  s.playerId = id;
  s.rawBackup = { eiUserId: id } as never;
}

describe('syncTEOverrideToAccount', () => {
  beforeEach(() => {
    installStorageStub();
    setActivePinia(createPinia());
  });

  it("gives each account its own override, and finds A's again after B without a reload", () => {
    saveAutoPlannerTEInputs(ID_A, { teEarned: TE_A });
    const planner = useAutoPlannerStore();
    load(ID_A);
    expect(syncTEOverrideToAccount()).toBe(true);
    expect(planner.teOverride).toEqual(TE_A);
    load(ID_B);
    expect(syncTEOverrideToAccount()).toBe(false);
    expect(planner.teOverride).toBeNull();
    load(ID_A);
    expect(syncTEOverrideToAccount()).toBe(true);
    expect(planner.teOverride).toEqual(TE_A);
  });

  it("keeps the store's override while the same account stays loaded (a restored plan's)", () => {
    const planner = useAutoPlannerStore();
    load(ID_A);
    syncTEOverrideToAccount();
    planner.teOverride = { ...TE_A, curiosity: 40 };
    expect(syncTEOverrideToAccount()).toBe(true);
    expect(planner.teOverride?.curiosity).toBe(40);
  });
});

describe('sanitizeTEOverride / loadAutoPlannerTEOverride', () => {
  beforeEach(() => installStorageStub());

  it('rounds and holds each egg to 0-98', () => {
    expect(sanitizeTEOverride({ ...TE_A, curiosity: 120, kindness: -3, humility: 31.6 })).toEqual({
      ...TE_A,
      curiosity: 98,
      kindness: 0,
      humility: 32,
    });
  });

  it('is no override when an egg is missing or not a number', () => {
    expect(sanitizeTEOverride({ ...TE_A, integrity: '31' })).toBeNull();
    const partial: Record<string, number> = { ...TE_A };
    delete partial.resilience;
    expect(sanitizeTEOverride(partial)).toBeNull();
    expect(sanitizeTEOverride(null)).toBeNull();
    expect(sanitizeTEOverride([1, 2, 3, 4, 5])).toBeNull();
  });

  it('reads a broken cache as no override', () => {
    localStorage.setItem(`auto_planner_te_inputs_v2:${ID_A}`, '{"teEarned":{}}');
    expect(loadAutoPlannerTEOverride(ID_A)).toBeNull();
    localStorage.setItem(`auto_planner_te_inputs_v2:${ID_A}`, 'not json');
    expect(loadAutoPlannerTEOverride(ID_A)).toBeNull();
  });
});
