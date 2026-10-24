/**
 * Prestige by's estimate with the player's hours and "hold each shift" on is priced held, as the answer and its
 * confirming lookups are (InstantRoute.vue passes `instantTail` as the request's `tail`; the math review, 24 Oct 2026,
 * finding 4). On the table version 2 spec's generator cells (tableV2.fixture.jsonl), against the held replay itself and
 * the route finder with the same hours.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packTable, readTable, withExtras } from './precomputedTable';
import { canonicalDelivered, type BuildParams } from './precomputedLeg';
import { bestReplay, type BuildExtras } from './tableV2';
import { findRoutes, type BuildLookup } from './routeFinder';
import { holdUntilOf, type Availability } from './availability';
import { instantTail } from './instantGear';
import { estimateAt, type EstimateRequest } from './prestigeBy';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

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
const table: BuildLookup = (te, h) => v2.lookup(te, h);
const holdUntil = holdUntilOf(HOURS);

/** Each cell's own hour a week later, inside the hours (the leg starts there, from that cell), and two targets. */
function cases(): { c: Cell; start: number; target: number }[] {
  const out: { c: Cell; start: number; target: number }[] = [];
  for (const c of cells) {
    const start = REFERENCE_WEEK + c.h * 3600 + 7 * 86400;
    if (holdUntil(start) !== start) continue;
    for (const target of [c.te + 3, c.te + 20].filter(t => t <= 490)) out.push({ c, start, target });
  }
  return out;
}
function request(c: Cell, start: number, target: number, mode: 'fastest' | 'date', deadline?: number): EstimateRequest {
  return {
    mode,
    prestigeAt: start,
    startTE: c.te,
    delivered: canonicalDelivered(c.te),
    laying: null,
    final: target,
    ...(deadline !== undefined ? { deadline } : {}),
    deliveryScale: 1,
    candidates: [[target]],
    hours: 0,
    playHours: HOURS,
  };
}

describe("Prestige by's estimate with the hours held (math review, 24 Oct 2026)", () => {
  it('Fastest: the held replay from the prestige, and what the finder finds with the same hours', async () => {
    let n = 0;
    let moved = 0;
    for (const { c, start, target } of cases()) {
      const want = bestReplay(
        c.builds.map(b => ({ params: plain(b), extras: b.extras })),
        target,
        { start, holdUntil, order: 'simulator' }
      );
      const req = request(c, start, target, 'fastest');
      const held = estimateAt(table, { ...req, tail: instantTail(HOURS, true) }, 0);
      if (!want) {
        expect(held.end).toBeNull();
        continue;
      }
      n++;
      expect(held.end).toBe(start + want.seconds);
      const f = await findRoutes({
        table,
        startTE: c.te,
        start,
        startDelivered: canonicalDelivered(c.te),
        final: target,
        maxAscensions: 1,
        hours: HOURS,
        ...instantTail(HOURS, true),
      });
      expect(held.end).toBe(f.best!.end);
      // Without the request's tail the shifts are not held (as before this fix).
      const free = estimateAt(table, req, 0);
      if (free.end !== held.end) moved++;
    }
    expect(n).toBeGreaterThan(5);
    // The hold matters on some of these cells, so the test would see the estimate left unheld.
    expect(moved).toBeGreaterThan(0);
  });

  it('By a date: the last ascension is priced held, so a date the unheld price makes can be missed held', () => {
    let n = 0;
    for (const { c, start, target } of cases()) {
      const want = bestReplay(
        c.builds.map(b => ({ params: plain(b), extras: b.extras })),
        target,
        { start, holdUntil, order: 'simulator' }
      );
      if (!want) continue;
      const deadline = start + want.seconds;
      const tail = instantTail(HOURS, true);
      const held = estimateAt(table, { ...request(c, start, target, 'date', deadline), tail }, 0);
      expect(held).toEqual({ te: target, end: deadline });
      // A second sooner and the held answer no longer reaches the target.
      const short = estimateAt(table, { ...request(c, start, target, 'date', deadline - 1), tail }, 0);
      expect(short.te).toBeLessThan(target);
      n++;
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('the instant answer asks for the estimate held', () => {
  it('passes the answer’s own tail options with the request', () => {
    const src = readFileSync(fileURLToPath(new URL('../components/auto/InstantRoute.vue', import.meta.url)), 'utf8');
    const req = src.slice(src.indexOf('const req = {'), src.indexOf('const stale = () => pid !== prestigeRuns;'));
    expect(req).toContain('...(hours ? { playHours: hours } : {}),');
    expect(req).toContain('tail: instantTail(hours, store.deferShifts),');
  });
});
