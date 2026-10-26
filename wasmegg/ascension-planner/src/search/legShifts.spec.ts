/**
 * Each ascension's shifts from the table's replay (search/legShifts.ts, routeFinder.ts `priceChain` with `shifts`), on
 * the table version 2 spec's twenty generator cells (tableV2.fixture.jsonl): the replay is the very leg the finder
 * priced (it ends when the leg ends, to the second), its shifts start at H1, run in time order inside the leg and end
 * on the egg the leg ends on; held for the player's hours they fall inside them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packTable, readTable, withExtras } from './precomputedTable';
import { canonicalDelivered, EGG_ORDER, type BuildParams } from './precomputedLeg';
import type { BuildExtras } from './tableV2';
import { priceChain, priceLeg, type BuildLookup } from './routeFinder';
import { holdUntilOf, type Availability } from './availability';
import { legShifts } from './legShifts';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

type Cell = { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] };
const cells: Cell[] = readFileSync(fileURLToPath(new URL('./tableV2.fixture.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));
const REFERENCE_WEEK = 1799654400;
const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
const v2 = withExtras(
  readTable(
    packTable(
      {
        version: 2,
        referenceWeek: REFERENCE_WEEK,
        cteBonus: 128.71,
        deliveryScore: 1,
        from: 120,
        to: 489,
        builtAt: 'x',
        teThresholds: [...TE_BREAKPOINTS],
        k3: { research: {}, delivery: [], peak: 3.3e12 },
      },
      cells
    ).buffer as ArrayBuffer
  )
);
const lookup: BuildLookup = (te, h) => v2.lookup(te, h);
const holdUntil = holdUntilOf(HOURS);

describe('legShifts: a priced leg\'s shifts from the table', () => {
  it('held for the hours: the replay is the leg priced (same end), H1 first, in order, inside the leg and the hours', () => {
    let n = 0;
    for (const c of cells) {
      const start = REFERENCE_WEEK + c.h * 3600 + 7 * 86400;
      if (holdUntil(start) !== start) continue;
      for (const target of [c.te + 3, c.te + 20].filter(t => t <= 490)) {
        const p = priceLeg(lookup, c.te, start, canonicalDelivered(c.te), target, 1, HOURS, { holdShifts: true, heldOpening: false });
        if (!p) continue;
        const r = legShifts(p.build, target, { start: p.start, lateBy: p.lateBy, holdUntil, order: 'simulator' })!;
        expect(r).not.toBeNull();
        expect(p.start + r.seconds).toBeCloseTo(p.end, 3);
        expect(r.shifts[0].egg).toBe('humility');
        for (let i = 1; i < r.shifts.length; i++) expect(r.shifts[i].at).toBeGreaterThanOrEqual(r.shifts[i - 1].at);
        for (const s of r.shifts) {
          expect(s.at).toBeGreaterThan(p.start);
          expect(s.at).toBeLessThanOrEqual(p.end);
          // A held shift waits for the player: every one is inside the hours.
          expect(holdUntil(s.at)).toBeCloseTo(s.at, 3);
        }
        expect(r.shifts[r.shifts.length - 1].egg).toBe(EGG_ORDER[p.lastEgg]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5);
  });

  it('a build without version 2 numbers has none', () => {
    const { extras: _x, ...plain } = cells[0].builds[0];
    expect(legShifts(plain, cells[0].te + 3, { start: REFERENCE_WEEK })).toBeNull();
  });
});

describe('priceChain with `shifts`', () => {
  const c = cells.find(x => holdUntil(REFERENCE_WEEK + x.h * 3600 + 7 * 86400) === REFERENCE_WEEK + x.h * 3600 + 7 * 86400)!;
  const start = REFERENCE_WEEK + c.h * 3600 + 7 * 86400;
  const options = {
    startTE: c.te,
    start,
    startDelivered: canonicalDelivered(c.te),
    hours: HOURS,
    holdShifts: true,
    heldOpening: false,
  };
  it('each table leg carries its shifts when asked, and the route is priced the same', () => {
    const plain = priceChain(lookup, options, [c.te + 5])!;
    const withShifts = priceChain(lookup, { ...options, shifts: true }, [c.te + 5])!;
    expect(plain.legs[0].shifts).toBeUndefined();
    expect(withShifts.legs[0].shifts!.length).toBeGreaterThan(1);
    const { shifts: _s, peakELR: _r, ...rest } = withShifts.legs[0];
    expect(rest).toEqual(plain.legs[0]);
    expect(withShifts.end).toBe(plain.end);
  });

  it('each table leg carries the rate its build produces at (the cell\'s peakELR, the rate priceLeg prices with)', () => {
    const plain = priceChain(lookup, options, [c.te + 5])!;
    const withShifts = priceChain(lookup, { ...options, shifts: true }, [c.te + 5])!;
    expect(plain.legs[0].peakELR).toBeUndefined();
    const p = priceLeg(lookup, c.te, start, canonicalDelivered(c.te), c.te + 5, 1, undefined, { holdShifts: true, heldOpening: false }, HOURS)!;
    expect(withShifts.legs[0].peakELR).toBe(p.rate);
    expect(withShifts.legs[0].peakELR).toBe(p.build.peakELR);
    expect(withShifts.legs[0].peakELR).toBeGreaterThan(0);
  });

  it('a fresh first ascension from first legs carries its rate; continue does not', () => {
    const first = (label: string) =>
      priceChain(
        lookup,
        {
          ...options,
          shifts: true,
          firstLegs: [{ to: c.te + 2, endTE: c.te + 2, end: start, delivered: canonicalDelivered(c.te + 2), label, rate: 2e12, peakELR: 3e12 }],
        },
        [c.te + 2]
      )!.legs[0];
    expect(first('2-sale').peakELR).toBe(2e12);
    expect(first('continue').peakELR).toBeUndefined();
    expect(first('buildup').peakELR).toBeUndefined();
  });

  it('a first ascension from the player\'s own first legs has none (the table does not hold it)', () => {
    const r = priceChain(
      lookup,
      {
        ...options,
        shifts: true,
        firstLegs: [{ to: c.te + 2, endTE: c.te + 2, end: start, delivered: canonicalDelivered(c.te + 2), label: 'continue' }],
      },
      [c.te + 2]
    )!;
    expect(r.legs[0].shifts).toBeUndefined();
  });
});
