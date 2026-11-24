/**
 * A table by its URL, as the route-finder worker reads one (workers/routeFinder.worker.ts), with the file fetch
 * handed in: the page fetches over HTTP (search/tableFetch.ts), the command line reads the folder
 * (scripts/precompute.ts --instant2). One reading of the URL kinds for both:
 *   - a composite (precomputedTable.ts compositeUrl): a gear table below a TE and the maxed one from it, each
 *     with its extras (the gear half had none until 22 Nov 2026: no held shifts, order or buys below the split);
 *   - the form G (gearShiftUrl): the maxed table moved to the player's gear;
 *   - a delivery set's table (deliveryUrl, 23 Nov 2026): it moved to the player's gear below its split, the maxed
 *     one (moved too, unless the player is as good as maxed) from it;
 *   - one table.
 * A version 2 table's builds carry their extras for the held replay (withExtras; version 1 as it is).
 */
import {
  compositeTable,
  gearShiftTable,
  parseCompositeUrl,
  parseDeliveryUrl,
  parseGearShiftUrl,
  withExtras,
  type Table,
} from './precomputedTable';
import { firstLegOptions, tailOptionsOf } from './routeFinder';
import type { FirstLegsRequest } from '@/workers/routeFinder.protocol';
import type { FirstLeg } from './routeFinder';

export function tableAtUrl(url: string, fetchTable: (url: string) => Promise<Table>): Promise<Table> {
  const dl = parseDeliveryUrl(url);
  if (dl) {
    const { url: highUrl, ...high } = dl.high;
    return Promise.all([fetchTable(dl.low.url), fetchTable(highUrl)]).then(([low, max]) =>
      compositeTable(
        gearShiftTable(withExtras(low), dl.low),
        high.g === undefined ? withExtras(max) : gearShiftTable(withExtras(max), high as typeof dl.low),
        dl.split,
        1
      )
    );
  }
  const c = parseCompositeUrl(url);
  const g = c ? null : parseGearShiftUrl(url);
  return c
    ? Promise.all([fetchTable(c.low), fetchTable(c.high)]).then(([low, high]) =>
        compositeTable(withExtras(low), withExtras(high), c.split, c.scale)
      )
    : g
      ? fetchTable(g.url).then(t => gearShiftTable(withExtras(t), g))
      : fetchTable(url).then(t => withExtras(t));
}

/** The worker's first-legs answer (routeFinder.ts `firstLegOptions`) on a loaded table. */
export function firstLegsOn(t: Table, m: Omit<FirstLegsRequest, 'kind' | 'id' | 'url'>): FirstLeg[] {
  return firstLegOptions({
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
  });
}
