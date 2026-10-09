/**
 * A route-search worker (search/routeFinder.ts): it holds the precomputed table and does the heavy
 * steps the page hands it. The page runs a few of these and splits each step's arrivals among them,
 * so the search uses several cores; merging and reading routes back stay on the page.
 *
 * The table (search/precomputedTable.ts) is fetched here on the first request and kept for the
 * worker's life, so a second search (another start time, another target) costs no download.
 */
import { compositeTable, parseCompositeUrl, type Table } from '@/search/precomputedTable';
import { fetchTable } from '@/search/tableFetch';
import { expandArrivals, firstLegOptions, polishFound } from '@/search/routeFinder';
import type { TailSweep } from '@/search/precomputedLeg';
import type { RouteWorkerRequest, RouteWorkerResponse } from './routeFinder.protocol';

const ctx = self as unknown as Worker;
/** Sweeps reused across steps (search/routeFinder.ts `expandArrivals`); cleared past this many. */
const CACHE_LIMIT = 60000;
let cache = new Map<string, TailSweep>();
let cacheKey = '';
let table: Promise<Table> | null = null;
let tableUrl = '';

function load(url: string): Promise<Table> {
  if (!table || tableUrl !== url) {
    tableUrl = url;
    // A gear table below a TE and the maxed one from it (precomputedTable.ts compositeUrl).
    const c = parseCompositeUrl(url);
    table = c
      ? Promise.all([fetchTable(c.low), fetchTable(c.high)]).then(([low, high]) =>
          compositeTable(low, high, c.split, c.scale)
        )
      : fetchTable(url);
    // A failed load is retried on the next request rather than remembered.
    table.catch(() => (table = null));
  }
  return table;
}

function reply(message: RouteWorkerResponse): void {
  ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<RouteWorkerRequest>) => {
  const m = event.data;
  try {
    const t = await load(m.url);
    switch (m.kind) {
      case 'header':
        reply({ kind: 'header', id: m.id, header: t.header });
        return;
      case 'first-legs':
        reply({
          kind: 'first-legs',
          id: m.id,
          firstLegs: firstLegOptions({
            table: t.lookup,
            startTE: m.startTE,
            start: m.start,
            final: m.final,
            deliveryScale: m.deliveryScale,
            delivered: m.delivered,
            cont: m.cont,
            firstAscension: m.firstAscension,
            pinSeconds: m.pinSeconds,
            maxContinueSeconds: m.maxContinueSeconds,
          }),
        });
        return;
      case 'expand': {
        // One cache per table and settings, kept across a search's steps (and the next search with
        // the same settings), bounded so a long session does not grow it without end.
        const key = `${tableUrl}|${JSON.stringify(m.settings)}`;
        if (key !== cacheKey || cache.size > CACHE_LIMIT) {
          cache = new Map();
          cacheKey = key;
        }
        reply({
          kind: 'expand',
          id: m.id,
          candidates: expandArrivals(t.lookup, m.settings, m.items, undefined, cache),
        });
        return;
      }
      case 'polish':
        reply({ kind: 'polish', id: m.id, found: polishFound(t.lookup, m.options, m.found) });
        return;
    }
  } catch (err) {
    reply({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
