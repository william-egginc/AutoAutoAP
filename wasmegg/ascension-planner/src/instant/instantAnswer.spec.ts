import { describe, expect, it } from 'vitest';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { packTable, readTable, type TableHeader } from './precomputedTable';
import { getNextSaleEnd } from '@/lib/events';
import { SIM_VERSION } from './simVersion';
import { latestOnly, pauseFor, Superseded } from './latestOnly';
import {
  answerFits,
  eggDaySeconds,
  FINAL_TE,
  nextEggDayYear,
  noAnswerFor,
  rowsShown,
  saveStart,
  workOutAnswer,
} from './instantAnswer';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

const header = (o: Partial<TableHeader> = {}): TableHeader => ({
  version: 1,
  referenceWeek: 0,
  cteBonus: 1,
  deliveryScore: 1,
  from: 75,
  to: 339,
  slots: 1,
  builtAt: 'x',
  simVersion: SIM_VERSION,
  ...o,
});

describe('noAnswerFor', () => {
  it('says why there is no answer: no table, another simulator, outside the table, at 490', () => {
    expect(noAnswerFor(null, 200)).toEqual({ kind: 'no-table' });
    expect(noAnswerFor(header({ simVersion: 'other' }), 200)?.kind).toBe('other-sim');
    expect(noAnswerFor(header({ simVersion: undefined }), 200)?.kind).toBe('other-sim');
    expect(noAnswerFor(header(), 60)).toEqual({ kind: 'below', from: 75, te: 60 });
    expect(noAnswerFor(header(), 400)).toEqual({ kind: 'above', to: 339, te: 400 });
    expect(noAnswerFor(header(), 490)).toEqual({ kind: 'at-target', te: 490 });
    expect(noAnswerFor(header(), 200)).toBeNull();
  });

  it('By a date: an empty date asks for one, a date gone by (or its 9:00 am passed today) says so', () => {
    const now = 1_800_000_000;
    expect(noAnswerFor(header(), 200, undefined, { dated: true, now })).toEqual({ kind: 'pick-date' });
    expect(noAnswerFor(null, 200, undefined, { dated: true, now })).toEqual({ kind: 'pick-date' });
    expect(noAnswerFor(header(), 200, now - 86400, { dated: true, now })).toEqual({ kind: 'date-passed' });
    expect(noAnswerFor(header(), 200, now, { dated: true, now })).toEqual({ kind: 'date-passed' });
    expect(noAnswerFor(header(), 200, now + 60, { dated: true, now })).toBeNull();
    // Fastest has no deadline to check.
    expect(noAnswerFor(header(), 200, undefined, { dated: false, now })).toBeNull();
  });
});

describe('answerFits', () => {
  it('rows are shown (and simulated) only for the goal they were worked out for', () => {
    const race = { dated: false };
    const d1 = { dated: true, deadline: 1_900_000_000 };
    expect(answerFits(race, { dated: false })).toBe(true);
    expect(answerFits(race, { dated: true, deadline: 1_900_000_000 })).toBe(false);
    // The date field cleared: no deadline, so no rows, not the race's.
    expect(answerFits(race, { dated: true })).toBe(false);
    expect(answerFits(d1, { dated: true })).toBe(false);
    expect(answerFits(d1, { dated: true, deadline: 1_900_000_000 })).toBe(true);
    expect(answerFits(d1, { dated: true, deadline: 1_900_086_400 })).toBe(false);
    expect(answerFits(d1, { dated: false })).toBe(false);
    expect(answerFits(null, { dated: false })).toBe(false);
  });
});

describe('saveStart', () => {
  it('counts every threshold the eggs passed and keeps the counts in table order', () => {
    const s = saveStart({
      curiosity: TE_BREAKPOINTS[9],
      kindness: TE_BREAKPOINTS[4] + 1,
      integrity: 0,
      resilience: TE_BREAKPOINTS[0],
      humility: TE_BREAKPOINTS[1] - 1,
    });
    expect(s.te).toBe(10 + 5 + 0 + 1 + 1);
    expect(s.delivered).toEqual([TE_BREAKPOINTS[9], TE_BREAKPOINTS[4] + 1, 0, TE_BREAKPOINTS[0], TE_BREAKPOINTS[1] - 1]);
  });
});

describe('Egg Day', () => {
  it('is 14 July 9:00 am Pacific, the next one not started yet', () => {
    expect(new Date(eggDaySeconds(2027) * 1000).toISOString()).toBe('2027-07-14T16:00:00.000Z');
    expect(nextEggDayYear(Date.parse('2026-10-19T00:00:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T15:59:00Z'))).toBe(2027);
    expect(nextEggDayYear(Date.parse('2027-07-14T16:01:00Z'))).toBe(2028);
  });
});

// A small synthetic table near the top of the game, so routes to 490 are short to work out.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000;
const FROM = 470;
function synthetic(): ReturnType<typeof readTable> {
  const cells: { te: number; h: number; builds: BuildParams[] }[] = [];
  for (let te = FROM; te <= FINAL_TE; te++)
    for (let h = 0; h < 168; h++) {
      const cellStart = START + ((h - pacificHourOfWeek(START) + 168) % 168) * 3600;
      cells.push({
        te,
        h,
        builds: [
          {
            sales: 1,
            tier13: false,
            waitStart: 3600 * (2 + (te % 5)),
            saleEnd: getNextSaleEnd(cellStart) - cellStart,
            peakELR: 1e16 * (1 + (te - FROM) / 4),
            delivered: canonicalDelivered(te),
          },
        ],
      });
    }
  const bytes = packTable({ ...header({ from: FROM, to: FINAL_TE }) }, cells);
  return readTable(bytes.buffer as ArrayBuffer);
}

describe('workOutAnswer and rowsShown', () => {
  const table = synthetic();
  const req = { startTE: FROM, start: START, delivered: canonicalDelivered(FROM), deliveryScale: 1 };

  it('Fastest: a route to 490 for each count, the best marked, from a fresh first ascension', async () => {
    const found = await workOutAnswer(table, req);
    const rows = rowsShown(found);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(r => r.best)).toHaveLength(1);
    for (const r of rows) {
      expect(r.route.chain).toHaveLength(r.ascensions);
      expect(r.route.chain[r.route.chain.length - 1]).toBe(FINAL_TE);
      expect(r.endTE).toBeGreaterThanOrEqual(FINAL_TE);
      // The first ascension is a fresh build, named as Joo's planner names its variants.
      expect(r.route.legs[0].label).toMatch(/^[123]-sale(-tier13)?$/);
      expect(r.route.legs[0].start).toBeGreaterThanOrEqual(START);
    }
    const best = rows.find(r => r.best)!;
    expect(best.route.end).toBe(Math.min(...rows.map(r => r.route.end)));
  });

  it('By a date: the highest TE by then for each count, never past the date', async () => {
    const fastest = await workOutAnswer(table, req);
    // Just before the fastest reaches 490: the best by then stops short of it.
    const deadline = fastest.best!.end - 600;
    const found = await workOutAnswer(table, { ...req, deadline });
    const rows = rowsShown(found, deadline);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.route.end).toBeLessThanOrEqual(deadline);
    const best = rows.find(r => r.best)!;
    expect(best.endTE).toBe(Math.max(...rows.map(r => r.endTE)));
    expect(best.endTE).toBeLessThan(FINAL_TE);
  });

  it('with a farm in progress, leg 1 is continue when that is sooner, and the routes carry on from it', async () => {
    // A farm that lays fast and has nothing to buy: continue beats a fresh build's purchases.
    const cont = { sales: 0, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 5e16, delivered: canonicalDelivered(FROM) };
    const found = await workOutAnswer(table, { ...req, cont });
    const rows = rowsShown(found);
    expect(rows.some(r => r.route.legs[0].label === 'continue')).toBe(true);
    for (const r of rows.filter(r => r.route.legs[0].label === 'continue')) expect(r.route.legs[0].start).toBe(START);
    const fresh = await workOutAnswer(table, req);
    expect(found.best!.end).toBeLessThanOrEqual(fresh.best!.end);
  });

  it('a superseded run stops before the polish instead of finishing', async () => {
    const l = latestOnly();
    l.note(1);
    const run = workOutAnswer(table, req, () => l.note(2) /* a goal switch arrives during the run */, pauseFor(1, l));
    await expect(run).rejects.toBeInstanceOf(Superseded);
    // The newest one runs to the end.
    const found = await workOutAnswer(table, req, undefined, pauseFor(2, l));
    expect(found.best).not.toBeNull();
  });

  it('a slower delivery rate never finishes sooner', async () => {
    const full = await workOutAnswer(table, req);
    const half = await workOutAnswer(table, { ...req, deliveryScale: 0.5 });
    expect(half.best!.end).toBeGreaterThan(full.best!.end);
  });
});
