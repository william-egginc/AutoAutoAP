/**
 * A run's "seed chain" is the chain it started from, not the live starting-chain box. That box follows
 * the instant answer, which re-ranks its routes once its exact check is done: a Fast run (10 Oct)
 * started from the table's 4-ascension route, and its CSV named the 7-ascension route the instant
 * answer settled on afterwards as its seed, a chain the run never priced.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const ACCOUNT = 'test-account';
const RAN_FROM = [197, 240, 295, 490];
const KEYS = [RAN_FROM, [197, 230, 295, 490]];

function memoryStorage() {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
}

async function openedRun() {
  vi.doMock('@/search/runLibrary', () => ({
    listRuns: async () => [
      {
        id: 'run1',
        version: 2,
        label: 'x',
        savedAt: 1,
        currentTE: 196,
        finalTE: 490,
        effort: 'quick',
        seedChain: RAN_FROM,
        bestChain: KEYS[0],
        bestDays: 667,
        chainsPriced: KEYS.length,
        complete: true,
      },
    ],
    loadRun: async () => ({
      entries: KEYS.map((k, i) => ({ key: k.join(','), seconds: (667 + i) * 86400, legs: [] })),
      bestLegs: [],
      runLog: [],
    }),
    saveRun: async () => null,
    deleteRun: async () => undefined,
    defaultRunLabel: () => 'x',
  }));
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  const s = useChainSearchStore();
  await s.refreshSavedRuns(ACCOUNT);
  expect(await s.openSavedRun(ACCOUNT, 'run1')).toBe(true);
  return s;
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
beforeEach(() => {
  vi.unstubAllGlobals();
  memoryStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@/search/runLibrary');
});

describe("a run's seed chain", () => {
  it('stays the one it ran from when the instant answer settles on another route', async () => {
    const s = await openedRun();
    s.minPrestiges = 4;
    s.maxPrestiges = 8;
    s.instantRoutes = [[200, 226, 249, 282, 316, 335, 490]];
    expect(s.seedChain).toEqual([200, 226, 249, 282, 316, 335, 490]);

    const csv = s.exportCsv();
    expect(csv).toContain(`# seed chain ${RAN_FROM.join(' ')}\n`);
    expect(csv).not.toContain('200 226 249');
    expect(s.buildRunSubmission()?.seed).toEqual(RAN_FROM);
  });
});
