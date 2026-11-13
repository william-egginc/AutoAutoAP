/**
 * Your runs' chip selection remembered per account (composables/useRunsExplore.ts): read back for the account it was
 * set on, not for another, kept under the account hash (never the ID). Ids: placeholders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useRunsExplore } from './useRunsExplore';
import { accountHash, accountHashNow } from '@/lib/accountHash';
import { RUNS_EXPLORE_PREFIX, emptyExplore } from '@/lib/runsExplore';

const ID = 'EI0000000000000000';
const OTHER = 'EI1234567890123456';
// Not hashed yet by the test above (accountHash remembers hashes), so the slow hash is really waited for.
const SLOW = 'EI0000000000000002';
const SLOW_OTHER = 'EI0000000000000003';
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

/** The account's hash is worked out (async, crypto.subtle: slow under load) and the list has picked it up. */
const ready = async (id: string) => {
  await vi.waitFor(() => expect(accountHashNow(id)).not.toBe(''), { timeout: 5000, interval: 5 });
  await settle();
};

async function rememberFlow(first: string, other: string) {
  const id = ref(first);
  const scope = effectScope();
  const { sel } = scope.run(() => useRunsExplore({ playerId: () => id.value }))!;
  await ready(first);
  sel.value = { ...sel.value, goal: ['eggday'], sort: 'newest' };
  await settle();
  const key = RUNS_EXPLORE_PREFIX + (await accountHash(first));
  expect([...mem.keys()]).toEqual([key]);
  expect(key).not.toContain(first);

  id.value = other;
  await ready(other);
  expect(sel.value).toEqual(emptyExplore());
  id.value = first;
  await ready(first);
  expect(sel.value).toMatchObject({ goal: ['eggday'], sort: 'newest' });
  scope.stop();

  // A fresh list (the next visit) starts from it too.
  const again = effectScope();
  const b = again.run(() => useRunsExplore({ playerId: () => first }))!;
  await settle();
  expect(b.sel.value.goal).toEqual(['eggday']);
  again.stop();
}

describe('useRunsExplore', () => {
  it('remembers the chips per account', () => rememberFlow(ID, OTHER));

  // PC flake 13 Nov (gate-tmem2): under load the account hash (crypto.subtle, async) took longer than settle(),
  // so the chips were set before the account was known and nothing was stored. A slow hash makes that certain.
  it('remembers the chips per account when the account hash is slow', async () => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...a: Parameters<SubtleCrypto['digest']>) => {
      await new Promise(r => setTimeout(r, 30));
      return digest(...a);
    });
    try {
      await rememberFlow(SLOW, SLOW_OTHER);
    } finally {
      vi.restoreAllMocks();
    }
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
