/**
 * A route-search worker (search/routeFinder.ts): it holds the precomputed table and does the heavy
 * steps the page hands it. The page runs a few of these and splits each step's arrivals among them,
 * so the search uses several cores; merging and reading routes back stay on the page.
 *
 * The table (search/precomputedTable.ts) is fetched here on the first request and kept for the
 * worker's life, so a second search (another start time, another target) costs no download.
 */
import type { Table } from '@/search/precomputedTable';
import { firstLegsOn, tableAtUrl } from '@/search/tableUrlLoad';
import { fetchTable } from '@/search/tableFetch';
import { expandArrivals, polishFound, priceChain } from '@/search/routeFinder';
import { estimateProfile } from '@/search/prestigeBy';
import { SweepCache } from '@/search/sweepCache';
import type { RouteWorkerRequest, RouteWorkerResponse } from './routeFinder.protocol';

const ctx = self as unknown as Worker;
/** Sweeps reused across steps (search/routeFinder.ts `expandArrivals`), held to a memory budget as each
 *  goes in (search/sweepCache.ts: 60,000 of them, the old limit, was about 2.3 GB). */
const cache = new SweepCache();
let cacheKey = '';
let table: Promise<Table> | null = null;
let tableUrl = '';

/** Kept by URL: an own or gear table's `.v2` name (tableGear.ts v2TableName) is another URL from its plain one, so
 *  the file read under one name is never reused for the other. */
function load(url: string): Promise<Table> {
  if (!table || tableUrl !== url) {
    tableUrl = url;
    // The URL's kinds (composite, the form G, one table) read as the command line reads them (search/tableUrlLoad.ts).
    table = tableAtUrl(url, fetchTable);
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
        reply({ kind: 'first-legs', id: m.id, firstLegs: firstLegsOn(t, m) });
        return;
      case 'expand': {
        // One cache per table and settings, kept across a search's steps (and the next search with
        // the same settings).
        const key = `${tableUrl}|${JSON.stringify(m.settings)}`;
        if (key !== cacheKey) {
          cache.clear();
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
      case 'price-chain':
        reply({ kind: 'price-chain', id: m.id, route: priceChain(t.lookup, m.options, m.chain) });
        return;
      case 'prestige-estimate':
        reply({ kind: 'prestige-estimate', id: m.id, outcomes: estimateProfile(t.lookup, m.request) });
        return;
    }
  } catch (err) {
    reply({ kind: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};

// Up: the pool stops waiting on a worker that never says so (search/routePool.ts ROUTE_WORKER_START_MS).
reply({ kind: 'ready', id: 0 });
