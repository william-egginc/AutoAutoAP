/**
 * Your runs' chip selection remembered per account (composables/useRunsExplore.ts): read back for the account it was
 * set on, not for another, kept under the account hash (never the ID). Ids: placeholders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useRunsExplore } from './useRunsExplore';
import { accountHash } from '@/lib/accountHash';
import { RUNS_EXPLORE_PREFIX, emptyExplore } from '@/lib/runsExplore';

const ID = 'EI0000000000000000';
const OTHER = 'EI1234567890123456';
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
  }
};

describe('useRunsExplore', () => {
  it('remembers the chips per account', async () => {
    const id = ref(ID);
    const scope = effectScope();
    const { sel } = scope.run(() => useRunsExplore({ playerId: () => id.value }))!;
    await settle();
    sel.value = { ...sel.value, goal: ['eggday'], sort: 'newest' };
    await settle();
    const key = RUNS_EXPLORE_PREFIX + (await accountHash(ID));
    expect([...mem.keys()]).toEqual([key]);
    expect(key).not.toContain(ID);

    id.value = OTHER;
    await settle();
    expect(sel.value).toEqual(emptyExplore());
    id.value = ID;
    await settle();
    expect(sel.value).toMatchObject({ goal: ['eggday'], sort: 'newest' });
    scope.stop();

    // A fresh list (the next visit) starts from it too.
    const again = effectScope();
    const b = again.run(() => useRunsExplore({ playerId: () => ID }))!;
    await settle();
    expect(b.sel.value.goal).toEqual(['eggday']);
    again.stop();
  });

  it('a starting selection (specs) is used as is and never stored', async () => {
    const scope = effectScope();
    const { sel } = scope.run(() => useRunsExplore({ playerId: () => ID, initial: { asc: [3] } }))!;
    await settle();
    expect(sel.value.asc).toEqual([3]);
    expect(mem.size).toBe(0);
    scope.stop();
  });
});
