import { describe, expect, it } from 'vitest';
import { accountKey, judgeFinishes, type FinishJudgement } from './analysis';
import type { CollectorRow } from './collector';
import {
  countSlotIndex,
  countSlotName,
  defaultDriftAccount,
  directionOf,
  driftTally,
  planDrift,
  type AccountDrift,
} from './drift';
import { DAY_MS } from '@/lib/leaderboardRank';

/** Only the fields the Leaderboard's rules and drift.ts read. */
function row(over: Partial<CollectorRow> & Pick<CollectorRow, 'id' | 'chain'>): CollectorRow {
  return {
    schema: 6,
    ascensions: over.chain.length,
    durationDays: 800,
    startLocal: '',
    endLocal: '',
    timezone: 'America/Denver',
    currentTE: 180,
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
    ...over,
  } as CollectorRow;
}

/** Plan starts at 10:00 Denver time (16:00 UTC in September) on day `n` after 1 Sep 2026. */
const START = Date.parse('2026-09-01T16:00:00Z');

/** A run planned to start `hours` after 10:00 on day `n`, sent five minutes after that. */
function at(n: number, hours = 0): { startLocal: string; submittedAt: string } {
  const t = START + n * DAY_MS + hours * 3_600_000;
  // Denver is UTC-6 in September.
  const local = new Date(t - 6 * 3_600_000).toISOString();
  return {
    startLocal: `${local.slice(0, 10)} ${local.slice(11, 16)}`,
    submittedAt: new Date(t + 5 * 60_000).toISOString(),
  };
}

/** A finish `days` after day 0's 10:00 start, as a plan length from a run started on day `n`. */
const lengthFor = (n: number, finishDay: number, hours = 0) => finishDay - n - hours / 24;

const NOW = START + 40 * DAY_MS;

function drift(rows: CollectorRow[], judged: FinishJudgement = judgeFinishes(rows, 490, NOW)): AccountDrift[] {
  return planDrift(rows, judged, 490, new Map([[accountKey(rows[0]), 'Allan']]));
}

describe('planDrift', () => {
  it('joins the same plan priced on two days and measures how far its finish moved', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'b', chain: [195, 300, 490], durationDays: lengthFor(3, 803.5), ...at(3) }),
    ];
    const [d] = drift(rows);
    expect(d.label).toBe('Allan');
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].points.map(p => p.id)).toEqual(['a', 'b']);
    expect(d.repricings).toHaveLength(1);
    const [r] = d.repricings;
    expect(r.moved).toBeCloseTo(3.5, 6);
    expect(r.apart).toBeCloseTo(3, 6);
    expect(directionOf(r)).toBe('later');
    // The newer pricing stands and is the account's best, so heights count from it.
    expect(d.anchorKind).toBe('standing');
    expect(d.points.find(p => p.id === 'b')!.behind).toBeCloseTo(0, 9);
    expect(d.points.find(p => p.id === 'a')!.behind).toBeCloseTo(-3.5, 6);
    expect(d.points.find(p => p.id === 'a')!.state).toBe('replaced');
  });

  it('treats a plan with its passed checkpoint dropped as the same plan', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'b', chain: [300, 490], currentTE: 196, durationDays: lengthFor(20, 800), ...at(20) }),
    ];
    const [d] = drift(rows);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].ascensions).toBe(3);
    expect(d.repricings[0]).toMatchObject({ from: { id: 'a' }, to: { id: 'b' } });
    expect(directionOf(d.repricings[0])).toBe('unchanged');
  });

  it('keeps plans made under different settings apart', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({
        id: 'b',
        chain: [195, 300, 490],
        window: 'every day 06:00-22:00',
        durationDays: lengthFor(2, 801),
        ...at(2),
      }),
      row({ id: 'c', chain: [200, 310, 490], durationDays: lengthFor(2, 802), ...at(2) }),
    ];
    const [d] = drift(rows);
    expect(d.lines).toHaveLength(3);
    expect(d.repricings).toEqual([]);
    expect(d.repricedPlans).toBe(0);
  });

  it('never joins two accounts, even on the same route', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'b', chain: [195, 300, 490], timezone: 'Europe/London', durationDays: 790, ...at(2) }),
    ];
    const out = drift(rows);
    expect(out).toHaveLength(2);
    expect(out.every(d => d.repricings.length === 0)).toBe(true);
  });

  it('draws two pricings under an hour apart on one line but does not count them as a re-pricing', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'b', chain: [195, 300, 490], durationDays: lengthFor(0, 800.2, 0.5), ...at(0, 0.5) }),
      row({ id: 'c', chain: [195, 300, 490], durationDays: lengthFor(1, 801, 2), ...at(1, 2) }),
    ];
    const [d] = drift(rows);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].points.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(d.repricings.map(r => [r.from.id, r.to.id])).toEqual([['b', 'c']]);
    expect(d.repricings[0].moved).toBeCloseTo(0.8, 6);
  });

  it('re-prices only the pricing each point matched: an unrecorded switch matches both answers, they never each other', () => {
    // A was sent before the finish-the-current-run switch existed; B and D finish first, C prestiges now.
    const route = [195, 300, 490];
    const rows = [
      row({ id: 'A', chain: route, durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'B', chain: route, forceContinue: true, durationDays: lengthFor(1, 801), ...at(1) }),
      row({ id: 'C', chain: route, forceContinue: false, durationDays: lengthFor(2, 805), ...at(2) }),
      row({ id: 'D', chain: route, forceContinue: true, durationDays: lengthFor(3, 801.5), ...at(3) }),
    ];
    const [d] = drift(rows);
    const pairs = d.repricings.map(r => `${r.from.id}>${r.to.id}`);
    expect([...pairs].sort()).toEqual(['A>B', 'A>C', 'B>D']);
    expect(pairs).not.toContain('B>C');
    expect(pairs).not.toContain('C>D');
    expect(d.points.map(p => [p.id, p.prev?.id ?? null])).toEqual([
      ['A', null],
      ['B', 'A'],
      ['C', 'A'],
      ['D', 'B'],
    ]);
    // C matched A, which B already follows: C branches from A instead of being strung after B.
    expect(d.lines.map(l => [l.points.map(p => p.id), l.from?.id ?? null])).toEqual([
      [['A', 'B', 'D'], null],
      [['C'], 'A'],
    ]);
    expect(d.lines[1].ascensions).toBe(3);
    const moved = Object.fromEntries(d.repricings.map(r => [`${r.from.id}>${r.to.id}`, Number(r.moved.toFixed(6))]));
    expect(moved).toEqual({ 'A>B': 1, 'A>C': 5, 'B>D': 0.5 });
    expect(d.repricedPlans).toBe(2);
  });

  it("keeps the line's ascensions and route when a later pricing has a passed checkpoint dropped", () => {
    const rows = [
      row({
        id: 'a',
        chain: [199, 223, 253, 282, 316, 490],
        currentTE: 198,
        durationDays: lengthFor(0, 800),
        ...at(0),
      }),
      row({ id: 'b', chain: [223, 253, 282, 316, 490], currentTE: 199, durationDays: lengthFor(2, 800.4), ...at(2) }),
    ];
    const [d] = drift(rows);
    expect(d.lines).toHaveLength(1);
    expect([d.lines[0].ascensions, d.lines[0].chain.join(' ')]).toEqual([6, '199 223 253 282 316 490']);
    expect(d.points[1].chain).toHaveLength(5);
  });

  it('adds a schema-7 re-check as a newer pricing of the plan it matches, and drops ones that match nothing', () => {
    const rows = [
      row({ id: 'old', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({
        id: 'new',
        schema: 7,
        chain: [205, 310, 490],
        durationDays: lengthFor(4, 799),
        rechecks: [
          { chain: [195, 300, 490], days: lengthFor(4, 806) },
          // Its own route again, and a route no earlier plan had: neither re-prices anything.
          { chain: [205, 310, 490], days: 700 },
          { chain: [240, 490], days: 900 },
        ],
        ...at(4),
      }),
    ];
    const [d] = drift(rows);
    const recheck = d.points.filter(p => p.kind === 'recheck');
    expect(recheck.map(p => p.id)).toEqual(['new~recheck0']);
    expect(recheck[0].start).toBe(d.points.find(p => p.id === 'new')!.start);
    expect(recheck[0].finish).toBeCloseTo(START + 806 * DAY_MS, -3);
    expect(recheck[0].grade).toBeNull();
    expect(d.repricings).toHaveLength(1);
    expect(d.repricings[0]).toMatchObject({ from: { id: 'old' }, to: { id: 'new~recheck0', kind: 'recheck' } });
    expect(d.repricings[0].moved).toBeCloseTo(6, 4);
  });

  it("reads an earlier plan among a later run's runners-up as a pricing from that run's save", () => {
    const rows = [
      row({ id: 'old', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({
        id: 'new',
        chain: [205, 310, 490],
        durationDays: lengthFor(1, 796),
        proof: {
          runnersUp: [
            { chain: [196, 300, 490], days: 900 },
            { chain: [195, 300, 490], days: lengthFor(1, 797) },
          ],
          byAscensions: [{ ascensions: 3, chain: [195, 300, 490], days: lengthFor(1, 797), priced: 10 }],
          spread: { best: 1, median: 2, worst: 3 },
        },
        ...at(1),
      }),
    ];
    const [d] = drift(rows);
    const table = d.points.filter(p => p.kind === 'table');
    // Once, although it is on both lists.
    expect(table.map(p => p.chain.join(' '))).toEqual(['195 300 490']);
    expect(d.repricings[0].moved).toBeCloseTo(-3, 4);
    expect(directionOf(d.repricings[0])).toBe('earlier');
  });

  it('leaves out a what-if run, whose finish is not a pricing of the account as it was', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      // Typed in from a TE above the save's own (schema 7).
      row({ id: 'w', schema: 7, chain: [195, 300, 490], currentTE: 190, backupTE: 181, durationDays: 790, ...at(2) }),
    ];
    const judged = judgeFinishes(rows, 490, NOW);
    expect(judged.byId.get('w')?.state).toBe('what-if');
    const [d] = drift(rows, judged);
    expect(d.points.map(p => p.id)).toEqual(['a']);
  });

  it('counts from the earliest finish shown when none of the account stands, and says so', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: 800, ...at(0) }),
      row({ id: 'b', chain: [200, 310, 490], durationDays: 805, ...at(0) }),
    ];
    const real = judgeFinishes(rows, 490, NOW);
    const judged: FinishJudgement = {
      byId: new Map([...real.byId].map(([id, j]) => [id, { ...j, standing: false, state: 'old-save' as const }])),
      bestByAccount: new Map(),
    };
    const [d] = drift(rows, judged);
    expect(d.anchorKind).toBe('own');
    expect(d.points.map(p => Number(p.behind.toFixed(6)))).toEqual([0, 5]);
  });

  it('lists the account with the most re-priced plans first, and opens on it', () => {
    const other = { timezone: 'Europe/London' };
    const rows = [
      row({ id: 'x1', chain: [195, 300, 490], durationDays: 800, ...at(0) }),
      row({ id: 'x2', chain: [199, 300, 490], durationDays: 800, ...at(0) }),
      row({ id: 'y1', chain: [195, 300, 490], durationDays: 800, ...other, ...at(0) }),
      row({ id: 'y2', chain: [195, 300, 490], durationDays: 798, ...other, ...at(2) }),
      row({ id: 'y3', chain: [210, 320, 490], durationDays: 798, ...other, ...at(0) }),
      row({ id: 'y4', chain: [210, 320, 490], durationDays: 797, ...other, ...at(3) }),
    ];
    const out = drift(rows);
    expect(out.map(d => d.repricedPlans)).toEqual([2, 0]);
    expect(defaultDriftAccount(out)).toBe(out[0].key);
    expect(out[0].key).toBe(accountKey(rows[2]));
    expect(defaultDriftAccount([])).toBeNull();
  });

  it('only uses runs at the target it was asked about', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: 800, ...at(0) }),
      row({ id: 'b', chain: [195, 300], finalTE: 300, durationDays: 300, ...at(2) }),
    ];
    const [d] = drift(rows);
    expect(d.points.map(p => p.id)).toEqual(['a']);
  });
});

describe('directionOf and driftTally', () => {
  it("calls a move under an hour unchanged, the Leaderboard's threshold", () => {
    expect(directionOf({ moved: 0.04 })).toBe('unchanged');
    expect(directionOf({ moved: -0.04 })).toBe('unchanged');
    expect(directionOf({ moved: 0.05 })).toBe('later');
    expect(directionOf({ moved: -2 })).toBe('earlier');
  });

  it('counts every account’s re-pricings by direction, with the largest each way', () => {
    const rows = [
      row({ id: 'a', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'b', chain: [195, 300, 490], durationDays: lengthFor(2, 806.5), ...at(2) }),
      row({ id: 'c', chain: [200, 310, 490], durationDays: lengthFor(0, 810), ...at(0) }),
      row({ id: 'd', chain: [200, 310, 490], durationDays: lengthFor(1, 809), ...at(1) }),
      row({ id: 'e', chain: [205, 320, 490], durationDays: lengthFor(0, 820), ...at(0) }),
      row({ id: 'f', chain: [205, 320, 490], durationDays: lengthFor(1, 820), ...at(1) }),
    ];
    const t = driftTally(drift(rows));
    expect(t).toMatchObject({ repricings: 3, accounts: 1, later: 1, unchanged: 1, earlier: 1, withinDay: 0 });
    expect(t.maxLater).toBeCloseTo(6.5, 6);
    expect(t.maxEarlier).toBeCloseTo(1, 6);
    expect(driftTally([])).toMatchObject({ repricings: 0, accounts: 0, maxLater: 0, maxEarlier: 0 });
    const sameDay = [
      row({ id: 'g', chain: [195, 300, 490], durationDays: lengthFor(0, 800), ...at(0) }),
      row({ id: 'h', chain: [195, 300, 490], durationDays: lengthFor(0, 800, 3), ...at(0, 3) }),
    ];
    expect(driftTally(drift(sameDay))).toMatchObject({ repricings: 1, withinDay: 1, unchanged: 1 });
  });
});

describe('count colours', () => {
  it('gives each count one fixed slot, 2 first and 9 and up sharing the last', () => {
    expect([2, 3, 8, 9, 15].map(countSlotIndex)).toEqual([0, 1, 6, 7, 7]);
    expect(countSlotIndex(1)).toBe(0);
    expect(countSlotName(3)).toBe('3 ascensions');
    expect(countSlotName(9)).toBe('9+ ascensions');
    expect(countSlotName(15)).toBe('9+ ascensions');
  });
});
