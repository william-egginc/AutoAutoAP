/**
 * THE SWEEP CACHE IS KEPT PER REQUEST'S TABLE (code review 22 Nov 2026, T1.3). The worker keyed its sweep cache by
 * the latest table URL (`tableUrl`), not the request's: an `expand` for table A still waiting on its load, overtaken by
 * a request for table B, kept its sweeps under B's key, so B's next step reused sweeps priced on A's cells.
 * The real worker with `self`, the table fetch, the sweep cache and `expandArrivals` stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteWorkerResponse } from './routeFinder.protocol';

const clears: number[] = [];
const seen: string[] = [];
vi.mock('@/search/sweepCache', () => ({
  SweepCache: class {
    clear() {
      clears.push(seen.length);
    }
  },
}));
vi.mock('@/search/routeFinder', async orig => ({
  ...(await orig<typeof import('@/search/routeFinder')>()),
  expandArrivals: (lookup: (te: number, h: number) => unknown) => {
    seen.push(String(lookup(0, 0)));
    return [];
  },
}));
vi.mock('@/search/tableFetch', () => ({
  fetchTable: async (url: string) => ({ header: { from: 0, to: 1 }, lookup: () => url }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('the worker sweep cache key', () => {
  it('two expands for two tables sent together: each clears the cache for its own table', async () => {
    const got = new Map<number, RouteWorkerResponse>();
    const ctx: { onmessage: ((e: MessageEvent) => Promise<void>) | null; postMessage(m: RouteWorkerResponse): void } = {
      onmessage: null,
      postMessage: m => void got.set(m.id, m),
    };
    vi.stubGlobal('self', ctx);
    vi.resetModules();
    await import('./routeFinder.worker');
    const expand = (id: number, url: string) =>
      ctx.onmessage!({ data: { kind: 'expand', id, url, settings: { top: 1 }, items: [] } } as unknown as MessageEvent);
    // A's load is still in flight when B's request swaps the worker's table.
    await Promise.all([expand(1, 'a.bin'), expand(2, 'b.bin')]);
    expect(got.get(1)?.kind).toBe('expand');
    expect(got.get(2)?.kind).toBe('expand');
    expect(seen).toEqual(['a.bin', 'b.bin']);
    // One clear before each table's first step (before: one only, B's step reused A's cache).
    expect(clears).toEqual([0, 1]);
    // A third step on B keeps B's cache.
    await expand(3, 'b.bin');
    expect(clears).toEqual([0, 1]);
  });
});
