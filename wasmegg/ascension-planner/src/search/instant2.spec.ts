import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gearShiftTable, gearShiftUrl, packTable, parseGearShiftUrl, readTable, withExtras } from './precomputedTable';
import { canonicalDelivered, rebase, tailTo, type BuildParams } from './precomputedLeg';
import { bestReplay, replayContinue, type BuildExtras, type BuildWithExtras } from './tableV2';
import { creditWait, firstLegOptions, priceLeg, type BuildLookup } from './routeFinder';
import { holdUntilOf, type Availability } from './availability';
import { gearShiftKey, instantTail, nearMaxedGear } from './instantGear';
import { countTEThresholdsPassed, TE_BREAKPOINTS } from '@/lib/truthEggs';

/** The table version 2 spec's twenty generator cells (tableV2.fixture.jsonl). */
type Cell = { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] };
const cells: Cell[] = readFileSync(fileURLToPath(new URL('./tableV2.fixture.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));
const REFERENCE_WEEK = 1799654400;
const HOURS: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
const plain = (b: BuildParams & { extras?: BuildExtras }): BuildParams => {
  const { extras: _, ...rest } = b;
  return rest;
};
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

describe('withExtras', () => {
  it("gives each build of a version 2 table with its extras, and version 1's numbers as they were", () => {
    for (const c of cells) {
      const got = v2.lookup(c.te, c.h)!;
      expect(got.map(plain)).toEqual(c.builds.map(plain));
      expect(got.map(b => (b as { extras?: BuildExtras }).extras)).toEqual(c.builds.map(b => b.extras));
    }
  });
});

describe('priceLeg with the player\'s hours held (instant answer v2)', () => {
  it('is the best held replay of the cell, from the start on the hour, in the simulator\'s order', () => {
    const holdUntil = holdUntilOf(HOURS);
    let n = 0;
    for (const c of cells) {
      // The cell's own hour in a later week, inside the hours or not: the leg starts on the next whole
      // hour inside them, from that hour's cell (here the fixture has only this one, so look it up there).
      const start = REFERENCE_WEEK + c.h * 3600 + 7 * 86400;
      if (holdUntil(start) !== start) continue;
      for (const target of [c.te + 3, c.te + 20].filter(t => t <= 490)) {
        const p = priceLeg(lookup, c.te, start, canonicalDelivered(c.te), target, 1, HOURS, { holdShifts: true });
        const want = bestReplay(
          c.builds.map(b => ({ params: plain(b), extras: b.extras })),
          target,
          { start, holdUntil, order: 'simulator' }
        );
        if (!want) {
          expect(p).toBeNull();
          continue;
        }
        n++;
        expect(p!.start).toBe(start);
        expect(p!.end).toBe(start + want.seconds);
        expect(p!.endTE).toBe(want.endTE);
        expect(p!.lastEgg).toBe(want.shifts[want.shifts.length - 1].egg);
      }
    }
    expect(n).toBeGreaterThan(5);
  });

  it("with order 'table' and no hours is tailTo, as version 1 prices it", () => {
    for (const c of cells.slice(0, 10)) {
      const start = REFERENCE_WEEK + c.h * 3600;
      const target = Math.min(490, c.te + 10);
      const p = priceLeg(lookup, c.te, start, canonicalDelivered(c.te), target, 1, undefined, { order: 'table' });
      const best = Math.min(...c.builds.map(b => tailTo(plain(b), target)?.seconds ?? Infinity));
      expect(p!.end).toBe(start + best);
    }
  });
});

describe('creditWait', () => {
  it('lays the egg the farm ended on until the player is back, and nothing when they are around', () => {
    const eggs = canonicalDelivered(250);
    // Thursday 23 Oct 2026 1:00 am Denver (7:00 UTC): back at 7:00 am, six hours later.
    const night = Math.floor(Date.UTC(2026, 9, 23, 7) / 1000);
    const out = creditWait(250, night, eggs, 2, 1e12, HOURS);
    expect(out.delivered[2] - eggs[2]).toBeCloseTo(1e12 * 6 * 3600, -3);
    expect(out.delivered.filter((x, i) => i !== 2)).toEqual(eggs.filter((_, i) => i !== 2));
    expect(out.te).toBe(Math.max(250, out.delivered.reduce((n, x) => n + countTEThresholdsPassed(x), 0)));
    const day = night + 8 * 3600;
    expect(creditWait(250, day, eggs, 2, 1e12, HOURS)).toEqual({ te: 250, delivered: eggs });
    expect(creditWait(250, night, eggs, 2, 1e12, undefined)).toEqual({ te: 250, delivered: eggs });
  });
});

describe('firstLegOptions with the player\'s hours', () => {
  const c = cells.find(x => x.te === 250)!;
  const cont: BuildParams = { sales: 0, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 2.5e12, delivered: c.builds[0].delivered };
  // Saturday 24 Oct 2026 3:00 am Denver: outside the hours.
  const start = Math.floor(Date.UTC(2026, 9, 24, 9) / 1000);
  const base = {
    table: lookup,
    startTE: 250,
    start,
    final: 300,
    delivered: c.builds[0].delivered,
    cont,
    firstAscension: 'continue' as const,
    pinSeconds: Infinity,
    maxContinueSeconds: Infinity,
  };
  it("holds continue as runContinueCurrent holds it (replayContinue), from the farm's own egg", () => {
    const legs = firstLegOptions({ ...base, hours: HOURS, holdShifts: true, contEgg: 3 });
    const holdUntil = holdUntilOf(HOURS);
    let held = 0;
    for (const l of legs) {
      const r = replayContinue(cont, 3, l.to, { start, holdUntil })!;
      expect(l.label).toBe('continue');
      expect(l.end).toBe(start + r.seconds);
      expect(l.delivered).toEqual(r.delivered);
      expect(l.lastEgg).toBe(r.lastEgg);
      held += r.heldSeconds;
    }
    expect(held).toBeGreaterThan(0);
  });
  it('without hours is continue as before (tailTo)', () => {
    for (const l of firstLegOptions(base)) expect(l.end - start).toBeCloseTo(tailTo(cont, l.to)!.seconds, 3);
  });
});

describe('gearShiftTable (the weak-gear form G)', () => {
  const maxed: BuildLookup = (te, h) => v2.lookup(te, h);
  it('with no gap and no scale is the maxed table', () => {
    const t = gearShiftTable(v2, { g: 0, geo: 1, cap: Infinity, k: 1 });
    for (const c of cells) expect(t.lookup(c.te, c.h)).toEqual(maxed(c.te, c.h));
  });
  it('takes the row g lower, moved onto this row\'s counts, its peak x geo but no higher than the cap', () => {
    const c = cells.find(x => x.te === 300)!;
    const g = 300 - 299; // a whole gap: one row
    const lower: typeof v2 = {
      ...v2,
      lookup: (te, h) => (te === 299 && h === c.h ? c.builds : v2.lookup(te, h)),
    };
    const cap = 0.9 * Math.max(...c.builds.map(b => b.peakELR)) * 0.8;
    const t = gearShiftTable(lower, { g, geo: 0.8, cap, k: 0.75 });
    const got = t.lookup(300, c.h)! as BuildWithExtras[];
    c.builds.forEach((b, i) => {
      expect(got[i].delivered).toEqual(rebase(b, 299, canonicalDelivered(300)).delivered);
      expect(got[i].peakELR).toBe(Math.min(b.peakELR * 0.8, cap));
      expect(got[i].extras!.h1Rate).toBe(b.extras.h1Rate * 0.8);
      expect(got[i].extras!.k3At).toBe(b.extras.k3At);
    });
  });
  it('below the table\'s first row once shifted, falls back to the old single scale', () => {
    const c = cells.find(x => x.te === 120)!;
    const t = gearShiftTable(v2, { g: 10, geo: 0.8, cap: Infinity, k: 0.75 });
    expect(t.lookup(120, c.h)!.map(b => b.peakELR)).toEqual(c.builds.map(b => b.peakELR * 0.75));
    expect(t.header.gearShift).toEqual({ g: 10, geo: 0.8, cap: Infinity, k: 0.75 });
  });
  it('round-trips its url', () => {
    const key = gearShiftKey({ g: 13.43, geo: 0.794, cap: 2.4e12, k: 0.7094 });
    expect(parseGearShiftUrl(gearShiftUrl('/precompute/table-v2.bin', key))).toEqual({
      url: '/precompute/table-v2.bin',
      g: 13.43,
      geo: 0.794,
      cap: 2.4e12,
      k: 0.7094,
    });
    expect(parseGearShiftUrl('/precompute/table-v2.bin')).toBeNull();
  });
  it('is skipped for a player as good as maxed, and the hours hold only with held shifts', () => {
    expect(nearMaxedGear({ g: 0.01, geo: 0.999, k: 1 })).toBe(true);
    expect(nearMaxedGear({ g: 0, geo: 0.966, k: 0.95 })).toBe(false);
    expect(instantTail(HOURS, true)).toEqual({ order: 'simulator', holdShifts: true });
    expect(instantTail(HOURS, false)).toEqual({ order: 'simulator' });
    expect(instantTail(null, true)).toEqual({ order: 'simulator' });
  });
});
