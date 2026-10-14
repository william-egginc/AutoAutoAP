import { describe, expect, it } from 'vitest';
import { canonicalDelivered, type BuildParams } from './precomputedLeg';
import { findRoutes, firstLegOptions, USEFUL_STOP_MAX, type BuildLookup, type Route } from './routeFinder';

const FROM = 300;
const FINAL = 310;
const START = Date.UTC(2027, 0, 12, 12) / 1000;

/** A fresh build at `te`: an hour of purchases, no sale to wait for, then laying at `peakELR`. */
function build(te: number, peakELR = 1e16): BuildParams {
  return { sales: 1, tier13: false, waitStart: 3600, saleEnd: 0, peakELR, delivered: canonicalDelivered(te) };
}

/** Every start TE from FROM up to (not including) `top`, every hour: the same kind of build. */
const tableTo =
  (top: number): BuildLookup =>
  te =>
    te >= FROM && te < top ? [build(te)] : null;

const stops = (r: Route) => r.chain.slice(0, -1);

describe('useful stops (USEFUL_STOP_MAX)', () => {
  it('is 360: margin over the highest stop any fastest route used (338)', () => {
    expect(USEFUL_STOP_MAX).toBe(360);
  });

  it('no route continues from a stop above the cap; without it, some do', async () => {
    const o = { table: tableTo(FINAL), startTE: FROM, start: START, final: FINAL, maxAscensions: 6 };
    const capped = await findRoutes({ ...o, usefulStopMax: 304 });
    const open = await findRoutes({ ...o, usefulStopMax: Infinity });
    const cappedRoutes = capped.byAscensions.filter((r): r is Route => !!r);
    expect(cappedRoutes.length).toBeGreaterThan(1);
    for (const r of cappedRoutes) for (const s of stops(r)) expect(s).toBeLessThanOrEqual(304);
    expect(open.byAscensions.some(r => r && stops(r).some(s => s > 304))).toBe(true);
    // A start above the cap still goes straight to the target.
    const high = await findRoutes({ ...o, startTE: 306, usefulStopMax: 304 });
    expect(high.best?.chain).toEqual([FINAL]);
  });

  it('a date search still ends above the cap (it only stops continuing from there)', async () => {
    const o = { table: tableTo(FINAL), startTE: FROM, start: START, final: FINAL, maxAscensions: 4 };
    const open = await findRoutes({ ...o, deadline: START + 400 * 86400, usefulStopMax: Infinity });
    const capped = await findRoutes({ ...o, deadline: START + 400 * 86400, usefulStopMax: 304 });
    expect(open.byDate).not.toBeNull();
    const top = open.byDate!.chain[open.byDate!.chain.length - 1];
    expect(capped.byDate!.chain[capped.byDate!.chain.length - 1]).toBe(top);
  });
});

describe('a first ascension above the table (freshLive)', () => {
  const o = {
    startTE: 305,
    start: START,
    final: FINAL,
    delivered: canonicalDelivered(305),
    cont: null,
    firstAscension: 'fresh' as const,
    pinSeconds: 1e12,
    maxContinueSeconds: 1e12,
  };

  it('uses the live build where the table has no row, never scaled', () => {
    const none = firstLegOptions({ ...o, table: tableTo(305) });
    expect(none).toEqual([]);
    const live = firstLegOptions({ ...o, table: tableTo(305), freshLive: [build(305)], deliveryScale: 3 });
    const asTable = firstLegOptions({ ...o, table: tableTo(FINAL), deliveryScale: 1 });
    expect(live.length).toBe(FINAL - 305);
    expect(live).toEqual(asTable);
  });

  it('keeps the table row where there is one', () => {
    const slow = build(305, 1e14);
    const withRow = firstLegOptions({ ...o, table: tableTo(FINAL), freshLive: [slow] });
    expect(withRow).toEqual(firstLegOptions({ ...o, table: tableTo(FINAL) }));
  });
});
