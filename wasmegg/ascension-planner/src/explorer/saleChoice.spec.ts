import { describe, it, expect } from 'vitest';
import { accountKey, judgeFinishes } from './analysis';
import type { CollectorRow } from './collector';
import type { SubmissionLeg } from '@/search/submission';
import { DAY_MS } from '@/lib/leaderboardRank';
import {
  GAIN_BANDS,
  isTier13,
  overlapOffsets,
  SALE_PLANS,
  SALE_SLOT,
  saleCellBreakdown,
  saleCellText,
  saleLegs,
  salePlanOf,
  saleSummary,
  startBands,
  type SaleLeg,
} from './saleChoice';

/** Only the fields these modules read. */
function row(over: Partial<CollectorRow> & Pick<CollectorRow, 'chain' | 'currentTE'>): CollectorRow {
  return {
    schema: 5,
    ascensions: over.chain.length,
    durationDays: 800,
    startLocal: '',
    endLocal: '',
    timezone: 'America/Denver',
    finalTE: 490,
    effort: 'balanced',
    window: null,
    holdShifts: false,
    waitingHours: null,
    artifacts: ['T4L Gusset', 'T4L Puzzle cube'],
    stones: [],
    legs: [],
    chainsPriced: 100,
    submittedAt: '',
    id: Math.random().toString(36).slice(2),
    ...over,
  } as CollectorRow;
}

const START = Date.parse('2026-09-01T16:00:00Z');
const dayOf = (n: number) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
const iso = (n: number) => new Date(START + n * DAY_MS + 5 * 60_000).toISOString();
const at = (n: number) => ({ startLocal: `${dayOf(n)} 10:00`, submittedAt: iso(n) });
const judge = (rows: CollectorRow[]) => judgeFinishes(rows, 490, START + 60 * DAY_MS);

/** Legs for a chain, one strategy per leg (leg 1 first), 50 days and 5 q/hr each unless given. */
function legsOf(chain: number[], strategies: string[], days: number[] = []): SubmissionLeg[] {
  return chain.map((te, i) => ({ te, strategy: strategies[i], days: days[i] ?? 50, peakDeliveryQph: 5 + i }));
}

describe('salePlanOf / isTier13', () => {
  it('reads the sale plan off the strategy the run stored, tier 13 or not', () => {
    expect(salePlanOf('continue')).toBe('continue');
    expect(salePlanOf('1-sale')).toBe('1-sale');
    expect(salePlanOf('2-sale-tier13')).toBe('2-sale');
    expect(salePlanOf('3-sale-tier13')).toBe('3-sale');
    expect(salePlanOf('4-sale')).toBeNull();
    expect(salePlanOf('12-sale')).toBeNull();
    expect(salePlanOf('')).toBeNull();
    expect(isTier13('2-sale-tier13')).toBe(true);
    expect(isTier13('2-sale')).toBe(false);
    expect(isTier13('continue')).toBe(false);
  });

  it('gives the three plans legs 2 onward use the first three palette slots', () => {
    expect(SALE_PLANS.slice(0, 3).map(p => SALE_SLOT[p])).toEqual([0, 1, 2]);
    expect(SALE_SLOT.continue).toBe(3);
  });
});

describe('saleLegs', () => {
  const a = row({
    id: 'a',
    chain: [200, 240, 290, 490],
    currentTE: 180,
    durationDays: 700,
    ...at(0),
    legs: legsOf(
      [200, 240, 290, 490],
      ['continue', '3-sale-tier13', '2-sale-tier13', '3-sale-tier13'],
      [20, 60, 70, 300]
    ),
  });

  it('leaves out leg 1 and starts every other leg at the previous leg’s target', () => {
    const legs = saleLegs([a], judge([a]));
    expect(legs.map(l => [l.leg, l.start, l.te, l.gain, l.plan, l.tier13])).toEqual([
      [2, 200, 240, 40, '3-sale', true],
      [3, 240, 290, 50, '2-sale', true],
      [4, 290, 490, 200, '3-sale', true],
    ]);
    expect(legs[0]).toMatchObject({ days: 60, peakQph: 6, runs: 1, accountKey: accountKey(a) });
  });

  it('draws only runs whose finish still stands', () => {
    const whatIf = row({
      id: 'wi',
      chain: [201, 250, 490],
      currentTE: 185,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
      legs: legsOf([201, 250, 490], ['continue', '1-sale', '1-sale']),
    });
    const legs = saleLegs([a, whatIf], judge([a, whatIf]));
    expect(legs.some(l => l.row.id === 'wi')).toBe(false);
    expect(legs).toHaveLength(3);
  });

  it('merges identical legs of one account, keeping the run that finishes first', () => {
    // Same save, a different last leg: legs 2 and 3 are the same legs, sent twice.
    const b = row({
      id: 'b',
      chain: [200, 240, 290, 480, 490],
      currentTE: 180,
      durationDays: 705,
      ...at(0),
      legs: legsOf(
        [200, 240, 290, 480, 490],
        ['continue', '3-sale-tier13', '2-sale-tier13', '3-sale-tier13', '1-sale'],
        [20, 58, 70, 290, 10]
      ),
    });
    const legs = saleLegs([b, a], judge([a, b]));
    const first = legs.find(l => l.start === 200)!;
    expect(first).toMatchObject({ runs: 2, daysLo: 58, daysHi: 60, days: 60 });
    expect(first.row.id).toBe('a'); // finishes 5 days before b
    expect(legs.filter(l => l.start === 240)).toHaveLength(1);
    // The legs that differ stay apart.
    expect(legs.map(l => `${l.start}-${l.te}`)).toEqual(['200-240', '240-290', '290-480', '290-490', '480-490']);
  });

  it('never merges across accounts, or across a different strategy', () => {
    const tokyo = row({
      id: 't',
      chain: [200, 240, 490],
      currentTE: 170,
      timezone: 'Asia/Tokyo',
      ...at(0),
      legs: legsOf([200, 240, 490], ['continue', '3-sale-tier13', '1-sale']),
    });
    const plain = row({
      id: 'p',
      chain: [200, 240, 490],
      currentTE: 180,
      durationDays: 710,
      ...at(0),
      legs: legsOf([200, 240, 490], ['continue', '3-sale', '1-sale']),
    });
    const all = [a, tokyo, plain];
    const at200 = saleLegs(all, judge(all)).filter(l => l.start === 200 && l.te === 240);
    expect(at200.map(l => [l.row.id, l.strategy]).sort()).toEqual([
      ['a', '3-sale-tier13'],
      ['p', '3-sale'],
      ['t', '3-sale-tier13'],
    ]);
  });

  it('skips a run with no per-leg detail, and legs it cannot read', () => {
    const bare = row({ id: 'bare', chain: [200, 490], currentTE: 180, ...at(1) });
    const odd = row({
      id: 'odd',
      chain: [210, 260, 490],
      currentTE: 190,
      timezone: 'Europe/Paris',
      ...at(0),
      legs: legsOf([210, 260, 490], ['continue', 'mystery', '2-sale']),
    });
    const legs = saleLegs([bare, odd], judge([bare, odd]));
    expect(legs.map(l => [l.row.id, l.start])).toEqual([['odd', 260]]);
  });
});

/** A mark for the summary tests: only what `saleSummary` reads. */
const mark = (account: string, start: number, gain: number, plan: SaleLeg['plan']): SaleLeg =>
  ({ key: `${account}|${start}|${gain}|${plan}`, accountKey: account, start, gain, te: start + gain, plan }) as SaleLeg;

describe('saleSummary', () => {
  it('bands starts every 20 TE from the lowest start to the highest', () => {
    expect(startBands([183, 245, 219]).map(b => b.label)).toEqual(['180–199', '200–219', '220–239', '240–259']);
    expect(startBands([])).toEqual([]);
  });

  it('names the commonest plan per start band and leg length, with its share, n and accounts', () => {
    const legs = [
      mark('x', 185, 20, '3-sale'),
      mark('y', 190, 25, '3-sale'),
      mark('z', 199, 30, '2-sale'),
      mark('x', 230, 40, '2-sale'),
      mark('y', 262, 10, '1-sale'),
      mark('x', 270, 12, '2-sale'),
    ];
    const s = saleSummary(legs);
    expect(s.starts.map(b => b.label)).toEqual(['180–199', '200–219', '220–239', '240–259', '260–279']);
    expect(s.gains.map(g => g.label)).toEqual(GAIN_BANDS.map(g => g.label));
    const c = s.cells[0][1]!; // 180-199, climbs 16-30
    expect(c).toMatchObject({ n: 3, accounts: 3, top: ['3-sale'] });
    expect(c.share).toBeCloseTo(2 / 3, 9);
    expect(saleCellText(c)).toBe('3-sale 67% (n 3)');
    expect(saleCellBreakdown(c)).toBe('3-sale 2, 2-sale 1');
    expect(s.cells[1].every(x => x === null)).toBe(true); // nothing starts at 200-219
    expect(s.cells[2][2]).toMatchObject({ n: 1, top: ['2-sale'], share: 1 });
    // A tie names both, in legend order.
    const tie = s.cells[4][0]!;
    expect(tie).toMatchObject({ n: 2, top: ['1-sale', '2-sale'], share: 0.5 });
    expect(saleCellText(tie)).toBe('1/2-sale 50% each (n 2)');
  });

  it('puts a leg on a band edge in the band it names', () => {
    const s = saleSummary([mark('x', 199, 15, '1-sale'), mark('x', 200, 16, '2-sale'), mark('x', 200, 81, '3-sale')]);
    expect(s.cells[0][0]).toMatchObject({ n: 1, top: ['1-sale'] });
    expect(s.cells[1][1]).toMatchObject({ n: 1, top: ['2-sale'] });
    expect(s.cells[1][4]).toMatchObject({ n: 1, top: ['3-sale'] });
  });
});

describe('overlapOffsets', () => {
  it('leaves a lone mark where it is and fans marks on one spot out in a ring', () => {
    const legs = [mark('x', 200, 40, '3-sale'), mark('y', 200, 40, '3-sale'), mark('z', 210, 40, '2-sale')];
    const off = overlapOffsets(legs, 4);
    expect(off.get(legs[2].key)).toEqual([0, 0]);
    const [p, q] = [off.get(legs[0].key)!, off.get(legs[1].key)!];
    expect(p).not.toEqual(q);
    for (const [dx, dy] of [p, q]) expect(Math.hypot(dx, dy)).toBeCloseTo(4, 1);
  });
});
