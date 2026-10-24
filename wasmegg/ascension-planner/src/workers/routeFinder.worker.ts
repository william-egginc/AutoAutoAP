/**
 * A route-search worker (search/routeFinder.ts): it holds the precomputed table and does the heavy
 * steps the page hands it. The page runs a few of these and splits each step's arrivals among them,
 * so the search uses several cores; merging and reading routes back stay on the page.
 *
 * The table (search/precomputedTable.ts) is fetched here on the first request and kept for the
 * worker's life, so a second search (another start time, another target) costs no download.
 */
import {
  compositeTable,
  gearShiftTable,
  parseCompositeUrl,
  parseGearShiftUrl,
  withExtras,
  type Table,
} from '@/search/precomputedTable';
import { fetchTable } from '@/search/tableFetch';
import { expandArrivals, firstLegOptions, polishFound, tailOptionsOf } from '@/search/routeFinder';
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

function load(url: string): Promise<Table> {
  if (!table || tableUrl !== url) {
    tableUrl = url;
    // A gear table below a TE and the maxed one from it (precomputedTable.ts compositeUrl); the maxed
    // one moved to the player's gear (gearShiftUrl, the weak-gear form G); or one table. A version 2
    // table's builds carry their extras for the held replay (withExtras; version 1 as it is).
    const c = parseCompositeUrl(url);
    const g = c ? null : parseGearShiftUrl(url);
    table = c
      ? Promise.all([fetchTable(c.low), fetchTable(c.high)]).then(([low, high]) =>
          compositeTable(low, withExtras(high), c.split, c.scale)
        )
      : g
        ? fetchTable(g.url).then(t => gearShiftTable(withExtras(t), g))
        : fetchTable(url).then(t => withExtras(t));
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
            buildUp: m.buildUp ?? null,
            freshLive: m.freshLive ?? null,
            firstAscension: m.firstAscension,
            pinSeconds: m.pinSeconds,
            maxContinueSeconds: m.maxContinueSeconds,
            ...(m.hours ? { hours: m.hours } : {}),
            ...(m.contEgg !== undefined ? { contEgg: m.contEgg } : {}),
            ...tailOptionsOf(m),
          }),
        });
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
