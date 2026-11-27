/**
 * The form G below its reach (review 15 Nov, T2; round 2 #11). The form G reads the maxed table's row TE - g; where
 * that falls below the table's first row it used the player's own row with only the peak scaled, ignoring the
 * earnings gap: 5-32% too fast per ascension, then a jump at 55 + g where a stronger start was SLOWER than a weaker
 * one. Now it clamps to the first row, moved onto the player's TE, and the page is told the cell is a fallback.
 */
import { describe, expect, it } from 'vitest';
import { formGBelowReach, gearShiftTable, type Table } from './precomputedTable';
import { canonicalDelivered, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import type { BuildWithExtras } from './tableV2';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

const FROM = 55;
/** A maxed table whose builds get faster with start TE, as real ones do. */
const maxed: Table = {
  header: {
    version: 2,
    referenceWeek: 1799654400,
    cteBonus: 128.71,
    deliveryScore: 1,
    from: FROM,
    to: 489,
    builtAt: 'x',
    teThresholds: [...TE_BREAKPOINTS],
    k3: { research: {}, delivery: [], peak: 3.3e12 },
    slots: 3,
  } as Table['header'],
  lookup(te, h) {
    if (te < FROM || te > 489 || h < 0 || h >= WEEK_HOURS) return null;
    return [1, 2, 3].map(sales => ({
      sales,
      tier13: false,
      waitStart: 2e6 - te * 2000 - sales * 10000 + h,
      saleEnd: 3e5 * sales,
      peakELR: 1e12 + te * 1e9,
      delivered: canonicalDelivered(te),
      extras: { layRate: 2e12, shipRate: 2e12, h1At: 1e5, h1Rate: 1e9, k3At: 2e5, k3Rate: 1e9, waitEgg: 0 },
    })) as BuildWithExtras[] as BuildParams[];
  },
};
const shift = { g: 12.4, geo: 0.8, cap: Infinity, k: 0.75 };

describe('form G below its reach', () => {
  const t = gearShiftTable(maxed, shift);
  const wait = (te: number, h: number, sales: number) => t.lookup(te, h)!.find(b => b.sales === sales)!.waitStart;

  it('a stronger start is never slower: waitStart(te + 1) <= waitStart(te), through 55 + g', () => {
    for (const h of [0, 83, 167])
      for (const sales of [1, 2, 3])
        for (let te = FROM; te < FROM + 40; te++)
          expect([te, h, sales, wait(te + 1, h, sales)]).toEqual([
            te,
            h,
            sales,
            Math.min(wait(te + 1, h, sales), wait(te, h, sales)),
          ]);
  });

  it('below the reach, clamps to the first row moved onto the TE', () => {
    for (const te of [FROM, FROM + 5, FROM + 12]) {
      const got = t.lookup(te, 7)!;
      const first = maxed.lookup(FROM, 7)!;
      got.forEach((b, i) => {
        expect(b.waitStart).toBe(first[i].waitStart);
        expect(b.delivered).toEqual(canonicalDelivered(te));
        expect(b.peakELR).toBe(first[i].peakELR * shift.geo);
      });
    }
  });

  it('says which TEs are below the reach: te - g < the first row', () => {
    expect(formGBelowReach(t.header, FROM)).toBe(true);
    expect(formGBelowReach(t.header, FROM + 12)).toBe(true);
    expect(formGBelowReach(t.header, FROM + 13)).toBe(false);
    expect(formGBelowReach(t.header, 300)).toBe(false);
    expect(formGBelowReach(maxed.header, FROM)).toBe(false);
    expect(formGBelowReach(gearShiftTable(maxed, { ...shift, g: 0 }).header, FROM)).toBe(false);
  });
});
