/**
 * THE FORM G UPWARD (Jordan, 24 Nov 2026 evening). A delivery-set table assumes the board's earnings set (Carpet's
 * combos: E/L/L's has a 126.4 bonus); a player whose earnings artifacts are stronger was read at g = 0, so slightly
 * pessimistic. In the simulator a set g Clothed-TE points STRONGER earns what the table's set earns g TE higher, so
 * the form G now shifts up too: the row TE - g with g < 0. Above the table's last row it takes that last row, moved
 * onto the TE (still a little pessimistic, never optimistic). The maxed table is never beaten, so its g stays >= 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formGBelowReach, gearShiftTable, type Table } from './precomputedTable';
import { nearMaxedGear } from './instantGear';
import { canonicalDelivered, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import type { BuildWithExtras } from './tableV2';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

const FROM = 150;
const TO = 339;
/** A delivery-set table whose builds get faster with start TE, as real ones do. */
const table: Table = {
  header: {
    version: 2,
    referenceWeek: 1799654400,
    cteBonus: 126.4,
    deliveryScore: 1,
    from: FROM,
    to: TO,
    builtAt: 'x',
    teThresholds: [...TE_BREAKPOINTS],
    k3: { research: {}, delivery: [], peak: 3.3e12 },
    slots: 3,
  } as Table['header'],
  lookup(te, h) {
    if (te < FROM || te > TO || h < 0 || h >= WEEK_HOURS) return null;
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
const wait = (t: Table, te: number, h: number, sales: number) =>
  t.lookup(te, h)!.find(b => b.sales === sales)!.waitStart;

describe('form G upward: earnings stronger than the table assumes (g < 0)', () => {
  it('reads the row TE - g above, moved onto the TE', () => {
    const t = gearShiftTable(table, { g: -3, geo: 1, cap: Infinity, k: 1 });
    for (const te of [FROM, 200, TO - 3])
      for (const h of [0, 99]) {
        const got = t.lookup(te, h)!;
        const row = table.lookup(te + 3, h)!;
        got.forEach((b, i) => {
          expect(b.waitStart).toBe(row[i].waitStart);
          expect(b.delivered).toEqual(canonicalDelivered(te));
        });
      }
  });
  it('a fractional g blends the two rows above', () => {
    const t = gearShiftTable(table, { g: -1.5, geo: 1, cap: Infinity, k: 1 });
    expect(wait(t, 200, 5, 2)).toBeCloseTo((wait(table, 201, 5, 2) + wait(table, 202, 5, 2)) / 2, 6);
  });
  it('is faster than g = 0, and a stronger start is never slower, up to the last TE', () => {
    const up = gearShiftTable(table, { g: -2.6, geo: 1, cap: Infinity, k: 1 });
    const flat = gearShiftTable(table, { g: 0, geo: 1, cap: Infinity, k: 1 });
    for (const te of [FROM, 250, TO - 3]) expect(wait(up, te, 3, 1)).toBeLessThan(wait(flat, te, 3, 1));
    for (let te = TO - 6; te < TO; te++)
      for (const sales of [1, 2, 3]) expect(wait(up, te + 1, 3, sales)).toBeLessThanOrEqual(wait(up, te, 3, sales));
  });
  it('above the last row, the last row moved onto the TE (never empty, never the first row)', () => {
    const t = gearShiftTable(table, { g: -3, geo: 1, cap: Infinity, k: 1 });
    for (const te of [TO - 1, TO]) {
      const got = t.lookup(te, 7)!;
      expect(got).not.toBeNull();
      const last = table.lookup(TO, 7)!;
      got.forEach((b, i) => {
        expect(b.waitStart).toBe(last[i].waitStart);
        expect(b.delivered).toEqual(canonicalDelivered(te));
      });
    }
  });
  it('keeps its g in the header and is never below its reach', () => {
    const t = gearShiftTable(table, { g: -3, geo: 1, cap: Infinity, k: 1 });
    expect(t.header.gearShift?.g).toBe(-3);
    expect(formGBelowReach(t.header, FROM)).toBe(false);
  });
  it('a player well above the table is not "as good as maxed": only a gap near 0 either way is', () => {
    expect(nearMaxedGear({ g: -1, geo: 1, k: 1 })).toBe(false);
    expect(nearMaxedGear({ g: -0.01, geo: 1, k: 1 })).toBe(true);
  });
  it('instantGearShift no longer floors g at 0 (the maxed table caps itself: nothing beats it)', () => {
    const src = readFileSync(join(__dirname, 'instantGear.ts'), 'utf8');
    expect(src).not.toMatch(/const g = Math\.max\(0, artifacts \+ colleggtibles \+ lab\)/);
  });
});
