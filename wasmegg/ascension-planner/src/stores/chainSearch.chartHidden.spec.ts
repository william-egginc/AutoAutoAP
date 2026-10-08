/**
 * The run chart is hidden by default, and while it is hidden nothing for it is built: no heat-map
 * counts, no snapshot, no point list. Everything else a run shows (the count, the runners-up)
 * does not read the chart's data.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const ACCOUNT = 'test-account';
const KEYS = [
  [212, 280, 490],
  [213, 280, 490],
  [214, 281, 490],
];

function memoryStorage(initial: Record<string, string> = {}) {
  const mem = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  return mem;
}

async function openedRun() {
  vi.doMock('@/search/runLibrary', () => ({
    listRuns: async () => [
      {
        id: 'run1',
        version: 2,
        label: 'x',
        savedAt: 1,
        currentTE: 0,
        finalTE: 490,
        effort: 'balanced',
        seedChain: [],
        bestChain: KEYS[0],
        bestDays: 760,
        chainsPriced: KEYS.length,
        complete: true,
      },
    ],
    loadRun: async () => ({
      entries: KEYS.map((k, i) => ({ key: k.join(','), seconds: (760 + i) * 86400, legs: [] })),
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
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@/search/runLibrary');
});

describe('the run chart is off until asked for', () => {
  it('is hidden by default and builds no chart data, while the count and shortlist still work', async () => {
    memoryStorage();
    const s = await openedRun();
    expect(s.chartShown).toBe(false);
    expect(s.pricedCount).toBe(3);
    expect(s.heat).toBeNull();
    expect(s.pricedChains).toHaveLength(0);
    s.rebuildShortlist();
    expect(s.heat).toBeNull();
    expect(s.pricedChains).toHaveLength(0);
    expect(s.pricedCount).toBe(3);
    expect(s.shortlist.length).toBeGreaterThan(0);
  });

  it('builds from the current results when shown, remembers the choice, and frees on hide', async () => {
    const mem = memoryStorage();
    const s = await openedRun();
    s.setChartShown(true);
    expect(mem.get('autoap.chartShown')).toBe('1');
    expect(s.heat?.total).toBe(3);
    expect(s.pricedChains).toHaveLength(3);
    s.rebuildShortlist();
    expect(s.heat?.total).toBe(3); // live: refreshed, not double-fed
    s.setChartShown(false);
    expect(mem.get('autoap.chartShown')).toBe('0');
    expect(s.heat).toBeNull();
    expect(s.pricedChains).toHaveLength(0);
    s.setChartShown(true); // shown again: rebuilt from scratch, same totals
    expect(s.heat?.total).toBe(3);
  });

  it('starts shown only when the browser remembers it, and survives blocked storage', async () => {
    memoryStorage({ 'autoap.chartShown': '1' });
    expect((await openedRun()).chartShown).toBe(true);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.resetModules();
    setActivePinia(createPinia());
    const { useChainSearchStore } = await import('./chainSearch');
    const s = useChainSearchStore();
    expect(s.chartShown).toBe(false);
    expect(() => s.setChartShown(true)).not.toThrow();
  });
});
