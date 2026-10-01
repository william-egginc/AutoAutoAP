/**
 * The instant route search (search/routeFinder.ts) off the page's thread: it reads every TE's builds
 * and works out tens of thousands of ascensions, which is a second or more of solid work.
 *
 * The table (search/precomputedTable.ts) is fetched here on the first request and kept for the
 * worker's life, so a second search (another start time, another target) costs no download.
 */
import { readTable, type Table } from '@/search/precomputedTable';
import { findRoutes, firstLegOptions } from '@/search/routeFinder';
import type { RouteWorkerRequest, RouteWorkerResponse } from './routeFinder.protocol';

const ctx = self as unknown as Worker;
let table: Promise<Table> | null = null;
let tableUrl = '';

function load(url: string): Promise<Table> {
  if (!table || tableUrl !== url) {
    tableUrl = url;
    // Revalidated, not taken from cache: the table grows while it is being built.
    table = fetch(url, { cache: 'no-cache' }).then(async res => {
      // The preview server answers a missing file with the app's own page, status 200.
      if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) {
        throw new Error(`the precomputed table could not be loaded (${res.ok ? 404 : res.status})`);
      }
      return readTable(await res.arrayBuffer());
    });
    // A failed load is retried on the next request rather than remembered.
    table.catch(() => (table = null));
  }
  return table;
}

ctx.onmessage = async (event: MessageEvent<RouteWorkerRequest>) => {
  const m = event.data;
  try {
    const t = await load(m.url);
    const h = t.header;
    if (m.kind === 'header') {
      ctx.postMessage({ kind: 'header', id: m.id, header: h } satisfies RouteWorkerResponse);
      return;
    }
    const t0 = performance.now();
    // Every TE from the player's up is needed; a table still being built covers only the top.
    if (Math.floor(m.startTE) < h.from) {
      ctx.postMessage({ kind: 'not-yet', id: m.id, header: h } satisfies RouteWorkerResponse);
      return;
    }
    // Each ascension reads the row for its own TE. Moving it by the player's Clothed TE bonus (to
    // match earning power) was tried and was worse: the row's TE also sets the hatchery, so a short
    // earnings set came out 5-7% slow against the board (scripts/precompute.ts --verify-table).
    const deliveryScale = m.deliveryScale;
    const firstLegs = firstLegOptions({
      table: t.lookup,
      startTE: m.startTE,
      start: m.start,
      final: m.final,
      deliveryScale,
      delivered: m.delivered,
      cont: m.cont,
      forceContinue: m.forceContinue,
      pinSeconds: m.pinSeconds,
      maxContinueSeconds: m.maxContinueSeconds,
    });
    const { best, byAscensions } = findRoutes({
      table: t.lookup,
      startTE: m.startTE,
      start: m.start,
      final: m.final,
      maxAscensions: m.maxAscensions,
      firstLegs,
      deliveryScale,
      onProgress: (done, of) => ctx.postMessage({ kind: 'progress', id: m.id, done, of } satisfies RouteWorkerResponse),
    });
    const reply: RouteWorkerResponse = {
      kind: 'routes',
      id: m.id,
      header: h,
      best,
      byAscensions,
      ms: performance.now() - t0,
    };
    ctx.postMessage(reply);
  } catch (err) {
    ctx.postMessage({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
