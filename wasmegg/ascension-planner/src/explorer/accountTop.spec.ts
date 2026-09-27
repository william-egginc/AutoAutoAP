import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAY_MS, localToUtcMs } from '@/lib/leaderboardRank';
import type { PricedChain } from '@/search/types';
import { accountKey, judgeFinishes, type FinishJudgement, type RunFinish } from './analysis';
import type { CollectorRow } from './collector';
import {
  accountTables,
  bestPerAscensions,
  createPlanMerger,
  leftOutText,
  mergeAccountTables,
  type AccountTable,
  type PlanSettings,
} from './accountTop';
import { parseAll } from './sweepStats';

const priced = (chain: number[], days: number): PricedChain => ({
  chain,
  days,
  prestiges: chain.length,
  lastCheckpoint: chain[chain.length - 2],
});

const T0 = Date.UTC(2026, 8, 20, 12);

describe('mergeAccountTables', () => {
  it('ranks by finish date, not by days: a later table counts from a later start', () => {
    const top = mergeAccountTables([
      { id: 'a', start: T0, currentTE: 150, chains: [priced([200, 490], 900)] },
      // Five fewer days, but counted from ten days later: it finishes five days after.
      { id: 'b', start: T0 + 10 * DAY_MS, currentTE: 150, chains: [priced([210, 490], 895)] },
    ]);
    expect(top.plans.map(p => [p.chain.join(' '), p.id])).toEqual([
      ['200 490', 'a'],
      ['210 490', 'b'],
    ]);
    expect(top.plans[1].finish - top.plans[0].finish).toBe(5 * DAY_MS);
  });

  it('keeps the newest measurement of a plan two tables priced, and counts the merge', () => {
    const tables: AccountTable[] = [
      { id: 'new', start: T0 + 2 * DAY_MS, currentTE: 150, chains: [priced([200, 490], 899), priced([220, 490], 910)] },
      { id: 'old', start: T0, currentTE: 150, chains: [priced([200, 490], 900), priced([230, 490], 905)] },
    ];
    const top = mergeAccountTables(tables);
    const plan = top.plans.find(p => p.chain.join(' ') === '200 490')!;
    // The newer table's 899 days from its later start, whatever order the tables arrived in.
    expect([plan.id, plan.days, plan.measurements]).toEqual(['new', 899, 2]);
    expect([top.merged, top.mergedPlans, top.tables]).toEqual([1, 1, 2]);
    expect(mergeAccountTables([...tables].reverse()).plans).toEqual(top.plans);
  });

  it('orders two tables from one start by when they were sent', () => {
    const top = mergeAccountTables([
      { id: 'later', start: T0, sent: '2026-09-20T13:00:00Z', currentTE: 150, chains: [priced([200, 490], 901)] },
      { id: 'first', start: T0, sent: '2026-09-20T12:30:00Z', currentTE: 150, chains: [priced([200, 490], 900)] },
    ]);
    expect(top.plans.map(p => [p.id, p.days])).toEqual([['later', 901]]);
  });

  it('keeps a plan whose first checkpoint a newer table shows the account past, marked, when nothing newer priced the rest', () => {
    const top = mergeAccountTables([
      { id: 'old', start: T0, currentTE: 150, chains: [priced([152, 490], 890), priced([200, 490], 900)] },
      { id: 'new', start: T0 + DAY_MS, currentTE: 155, chains: [priced([300, 490], 950)] },
    ]);
    expect(top.plans.map(p => [p.chain.join(' '), p.passed, p.rest.join(' ')])).toEqual([
      ['152 490', [152], '490'],
      ['200 490', [], '200 490'],
      ['300 490', [], '300 490'],
    ]);
    expect([top.passed, top.restRepriced, top.merged]).toEqual([1, 0, 0]);
  });

  it("lets a newer table's measurement of what is left replace the whole plan's", () => {
    const tables: AccountTable[] = [
      { id: 'old', start: T0, currentTE: 150, chains: [priced([152, 200, 490], 890), priced([210, 490], 900)] },
      { id: 'new', start: T0 + DAY_MS, currentTE: 155, chains: [priced([200, 490], 889.5), priced([300, 490], 950)] },
    ];
    const top = mergeAccountTables(tables);
    // 890 days from T0 against 889.5 from a day later: the newer measurement finishes half a day later.
    expect(top.plans.map(p => [p.chain.join(' '), p.id, p.measurements])).toEqual([
      ['200 490', 'new', 2],
      ['210 490', 'old', 1],
      ['300 490', 'new', 1],
    ]);
    expect(top.plans[0].finish - (T0 + 890 * DAY_MS)).toBe(0.5 * DAY_MS);
    expect([top.passed, top.restRepriced, top.merged, top.mergedPlans]).toEqual([0, 1, 1, 1]);
    const where = top.locate([152, 200, 490], undefined, 'old')!;
    expect([where.own, where.plan.id, where.plan.chain]).toEqual([false, 'new', [200, 490]]);
    expect(top.locate([210, 490], undefined, 'old')).toMatchObject({ own: true, plan: { id: 'old' } });
    expect(top.locate([999, 490], undefined, 'old')).toBeNull();
    expect(mergeAccountTables([...tables].reverse()).plans).toEqual(top.plans);
  });

  it('names the earliest finish at each ascension count', () => {
    const top = mergeAccountTables([
      {
        id: 'a',
        start: T0,
        currentTE: 150,
        chains: [
          priced([200, 490], 900),
          priced([210, 490], 901),
          priced([200, 300, 490], 880),
          priced([200, 310, 490], 885),
        ],
      },
    ]);
    expect(bestPerAscensions(top.plans).map(p => p.chain.join(' '))).toEqual(['200 300 490', '200 490']);
  });

  it('keeps plans priced under different settings apart, and tags them in the runs table words', () => {
    // Halceyx: one save priced twice, "prestige now" and "finish the current run first".
    const now: PlanSettings = { forceContinue: false, holdShifts: true };
    const first: PlanSettings = { forceContinue: true, holdShifts: true };
    const tables: AccountTable[] = [
      { id: '16f9', start: T0, sent: 'b', currentTE: 124, settings: now, chains: [priced([277, 490], 1120.71)] },
      {
        id: '1fed',
        start: T0,
        sent: 'a',
        currentTE: 124,
        settings: first,
        chains: [priced([277, 490], 1120.71), priced([280, 490], 1121)],
      },
    ];
    const top = mergeAccountTables(tables);
    // Only look-alikes are tagged: 280 490 has no twin under the other setting.
    expect(top.plans.map(p => [p.chain.join(' '), p.id, p.tags])).toEqual([
      ['277 490', '1fed', ['finishes current run first']],
      ['277 490', '16f9', ['prestiges now']],
      ['280 490', '1fed', []],
    ]);
    expect(top.merged).toBe(0);
    expect(new Set(top.plans.map(p => p.key)).size).toBe(3);
    expect(mergeAccountTables([...tables].reverse()).plans).toEqual(top.plans);
  });

  it('never lets a newer table with a schedule overwrite a plan priced any time', () => {
    const anyTime: PlanSettings = { forceContinue: true, holdShifts: true, window: null };
    const window: PlanSettings = { ...anyTime, window: 'every day 06:00-00:00 America/Los_Angeles' };
    const top = mergeAccountTables([
      { id: 'e0ca', start: T0, currentTE: 124, settings: anyTime, chains: [priced([160, 490], 897)] },
      { id: 'bf8a', start: T0 + 2 * DAY_MS, currentTE: 124, settings: window, chains: [priced([160, 490], 899)] },
    ]);
    expect(top.plans.map(p => [p.id, p.tags])).toEqual([
      ['e0ca', ['any time']],
      ['bf8a', ['every day 06:00-00:00']],
    ]);
    expect(top.merged).toBe(0);
  });

  it('matches an unrecorded first-ascension switch with either answer, newest later one winning', () => {
    const unknown: PlanSettings = {};
    const top = mergeAccountTables([
      { id: 'old', start: T0, currentTE: 150, settings: unknown, chains: [priced([200, 490], 900)] },
      {
        id: 'on',
        start: T0 + DAY_MS,
        currentTE: 150,
        settings: { forceContinue: true },
        chains: [priced([200, 490], 899)],
      },
      {
        id: 'off',
        start: T0 + 2 * DAY_MS,
        currentTE: 150,
        settings: { forceContinue: false },
        chains: [priced([200, 490], 898.5)],
      },
    ]);
    // `old` is replaced by the newest measurement it matches; `on` and `off` never match each other.
    expect(top.plans.map(p => [p.id, p.measurements])).toEqual([
      ['on', 1],
      ['off', 2],
    ]);
    expect(top.merged).toBe(1);
  });

  it('merges table by table as they arrive', () => {
    const merger = createPlanMerger();
    merger.add({ id: 'a', start: T0, currentTE: 150, chains: [priced([200, 490], 900)] });
    expect(merger.result().plans).toHaveLength(1);
    merger.add({ id: 'b', start: T0 + DAY_MS, currentTE: 150, chains: [priced([200, 490], 899)] });
    expect(merger.result().plans.map(p => p.id)).toEqual(['b']);
  });
});

describe('accountTables', () => {
  const base = {
    schema: 7,
    chain: [200, 490],
    ascensions: 2,
    currentTE: 150,
    finalTE: 490,
    durationDays: 900,
    startLocal: '2026-09-20 12:00',
    endLocal: '',
    timezone: 'America/Denver',
    artifacts: [],
    stones: [],
    legs: [],
    submittedAt: '',
  };
  const mk = (id: string, over: Partial<CollectorRow> = {}) => ({ ...base, id, hasCsv: true, ...over }) as CollectorRow;
  const finish = (over: Partial<RunFinish>): RunFinish => ({
    start: T0,
    finish: T0 + 900 * DAY_MS,
    state: 'current',
    reason: '',
    standing: true,
    behind: 0,
    best: false,
    sameSaveAsBest: false,
    ...over,
  });
  const rows = [
    mk('stands'),
    mk('replaced'),
    mk('whatif'),
    mk('to300', { finalTE: 300 }),
    mk('notable', { hasCsv: false }),
    mk('other', { timezone: 'Europe/London' }),
  ];
  const judged: FinishJudgement = {
    byId: new Map([
      ['stands', finish({})],
      [
        'replaced',
        finish({ standing: false, state: 'replaced', reason: 'replaced by a newer run of the same plan (24 Sep)' }),
      ],
      ['whatif', finish({ standing: false, state: 'what-if', reason: 'what-if start (planned to start 1 Oct)' })],
      ['notable', finish({})],
      ['other', finish({})],
    ]),
    bestByAccount: new Map(),
  };

  it("uses only the account's standing runs at the target, and says why the rest were left out", () => {
    const t = accountTables(rows, accountKey(rows[0]), 490, judged);
    expect(t.load.map(r => r.id)).toEqual(['stands']);
    expect(t.left.map(l => [l.tag, l.runs])).toEqual([
      ['replaced', 1],
      ['to 300 TE', 1],
      ['what-if', 1],
    ]);
    expect(t.left.find(l => l.tag === 'replaced')?.reasons[0]).toMatch(/newer run/);
    expect(t.noTable).toBe(1);
    expect(t.left.map(leftOutText)).toEqual(['1 replaced', '1 run to 300 TE', '1 what-if']);
    expect(leftOutText({ tag: 'to 490 TE', runs: 11 })).toBe('11 runs to 490 TE');
  });
});

/* ------------------------------------------- agreeing with the runs table on the account's best */

describe("the list's first plan and the runs table's earliest finish", () => {
  // allanfieldhouse on 24-25 Sep, as the collector has it (Chicago; the schedule on every staged run).
  const W = 'every day 07:00-23:00 America/Chicago';
  const run = (id: string, over: Partial<CollectorRow>): CollectorRow =>
    ({
      schema: 6,
      id,
      hasCsv: true,
      finalTE: 490,
      endLocal: '',
      timezone: 'America/Chicago',
      artifacts: ['T4L Demeters necklace', 'T4L Puzzle cube'],
      stones: [],
      legs: [],
      effort: 'balanced',
      holdShifts: true,
      forceContinue: true,
      window: W,
      waitingHours: null,
      chainsPriced: 900,
      ...over,
      ascensions: over.chain!.length,
    }) as CollectorRow;
  const rows = [
    run('a', {
      chain: [199, 225, 255, 290, 324, 490],
      currentTE: 198,
      durationDays: 664.0783,
      startLocal: '2026-09-24 09:10',
      submittedAt: '2026-09-24T14:23:58Z',
    }),
    run('b', {
      chain: [225, 255, 290, 328, 490],
      currentTE: 199,
      durationDays: 663.2713,
      startLocal: '2026-09-25 13:52',
      submittedAt: '2026-09-25T20:01:58Z',
    }),
    run('c', {
      chain: [223, 253, 282, 316, 490],
      currentTE: 199,
      durationDays: 663.7,
      startLocal: '2026-09-25 11:43',
      submittedAt: '2026-09-25T18:50:54Z',
    }),
    run('d', {
      chain: [230, 260, 297, 490],
      currentTE: 198,
      durationDays: 665.7,
      startLocal: '2026-09-24 15:44',
      window: null,
      submittedAt: '2026-09-24T23:18:01Z',
    }),
    run('e', {
      chain: [283, 490],
      currentTE: 198,
      durationDays: 704.27,
      startLocal: '2026-09-24 11:32',
      submittedAt: '2026-09-24T16:51:58Z',
    }),
    run('f', {
      chain: [283, 490],
      currentTE: 198,
      durationDays: 703.95,
      startLocal: '2026-09-24 12:21',
      window: null,
      submittedAt: '2026-09-24T17:24:50Z',
    }),
  ];
  const judged = judgeFinishes(rows, 490, Date.UTC(2026, 8, 27));
  const key = accountKey(rows[0]);
  const load = accountTables(rows, key, 490, judged).load;
  /** Each run's table: its own winner first, then `extra`. */
  const tablesWith = (extra: Record<string, PricedChain[]> = {}): AccountTable[] =>
    load.map(r => ({
      id: r.id,
      start: judged.byId.get(r.id)!.start!,
      sent: r.submittedAt,
      currentTE: r.currentTE,
      settings: r,
      chains: [
        priced(r.chain, r.durationDays),
        priced([...r.chain.slice(0, -2), r.chain[r.chain.length - 2] + 3, 490], r.durationDays + 2),
        ...(extra[r.id] ?? []),
      ],
    }));

  it('is the same plan when no newer table priced the rest of it', () => {
    const best = judged.bestByAccount.get(key)!;
    expect(best.row.id).toBe('a');
    expect(load.map(r => r.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const top = mergeAccountTables(tablesWith());
    const first = top.plans[0];
    // The plan the account is on: its 199 is behind it now (the 25 Sep runs are from TE 199), and it
    // is kept, not dropped, with 199 marked.
    expect([first.id, first.chain, first.passed, first.ascensions]).toEqual(['a', best.row.chain, [199], 6]);
    expect(Math.abs(first.finish - best.finish)).toBeLessThan(60_000);
    expect(top.locate(best.row.chain, best.row, 'a')?.own).toBe(true);
    // The schedule and any-time 283 490 are two plans, each tagged.
    expect(top.plans.filter(p => p.chain.join(' ') === '283 490').map(p => [p.id, p.tags])).toEqual([
      ['f', ['any time']],
      ['e', ['every day 07:00-23:00']],
    ]);
  });

  it("gives way to a newer table's measurement of what is left, and says whose", () => {
    // The live case: the 25 Sep run was seeded with 225 255 290 324 490, the rest of the 24 Sep best,
    // and priced it one day later.
    const top = mergeAccountTables(tablesWith({ b: [priced([225, 255, 290, 324, 490], 663.8825)] }));
    const best = judged.bestByAccount.get(key)!;
    const where = top.locate(best.row.chain, best.row, 'a')!;
    expect([where.own, where.plan.id, where.plan.chain.join(' ')]).toEqual([false, 'b', '225 255 290 324 490']);
    expect((where.plan.finish - best.finish) / DAY_MS).toBeCloseTo(1, 3);
    expect(top.restRepriced).toBe(1);
    expect(top.plans[0].chain.join(' ')).toBe('225 255 290 328 490');
    expect(top.plans.some(p => p.chain.join(' ') === best.row.chain.join(' '))).toBe(false);
  });
});

/* ----------------------------------------------- the tables the collector stored, where present */

// Stored run tables (`<id>.csv` as GET /csv serves them, unzipped) are player data, so none are
// committed: point EXPLORER_CSV_DIR at a folder of them to run these checks; without it they skip.
const CSV_DIR = process.env.EXPLORER_CSV_DIR ?? '';
const has = (...ids: string[]) => !!CSV_DIR && ids.every(id => existsSync(join(CSV_DIR, `${id}.csv`)));

/** A stored table as the page would merge it, its start and settings read off its own header. */
function table(id: string): AccountTable {
  const text = readFileSync(join(CSV_DIR, `${id}.csv`), 'utf8');
  const local = /# plan start (\S+ \S+)/.exec(text)![1];
  const zone = /# generated .*\(([^)]+)\)/.exec(text)![1];
  const window = /# available (.*)/.exec(text)![1].trim();
  const settings: PlanSettings = {
    forceContinue: /force-continue on/.test(text),
    holdShifts: true,
    window: window === 'any time' ? null : window,
  };
  const parsed = parseAll(text);
  return { id, start: localToUtcMs(local, zone)!, currentTE: parsed.currentTE, settings, chains: parsed.chains };
}

describe.skipIf(!has('d4507676', '5881269e', '16f9fe98', '5f8be0b3'))('stored tables', () => {
  it("keeps the newer of one account's two 2-ascension sweeps, plan by plan", () => {
    // Williamthe5thc: M1 from TE 181 on 22 Sep, and again from TE 182 on 24 Sep.
    const top = mergeAccountTables([table('5881269e'), table('d4507676')]);
    expect(top.tables).toBe(2);
    // Every plan of the newer table was in the older one too. 182 is behind the account now and the
    // newer table priced nothing of 182 490's rest, so the older measurement stays, 182 marked.
    expect([top.merged, top.mergedPlans, top.passed, top.plans.length]).toEqual([307, 307, 1, 308]);
    const passed = top.plans.filter(p => p.passed.length);
    expect(passed.map(p => [p.chain.join(' '), p.id, p.passed])).toEqual([['182 490', '5881269e', [182]]]);
    expect(top.plans.every(p => p.passed.length || (p.id === 'd4507676' && p.measurements === 2))).toBe(true);
    const best = top.plans[0];
    expect(best.chain.join(' ')).toBe('279 490');
    expect(best.days).toBeCloseTo(850.3387, 4);
    expect(best.finish).toBe(best.start + best.days * DAY_MS);
  });

  it('interleaves plans of different counts by finish date', () => {
    // Halceyx: an M1 on 24 Sep and an F2 the next day, both from TE 124.
    const m1 = table('16f9fe98');
    const f2 = table('5f8be0b3');
    const top = mergeAccountTables([m1, f2]);
    expect(top.merged).toBe(0);
    expect(top.plans).toHaveLength(m1.chains.length + f2.chains.length);
    expect(top.plans[0].chain.join(' ')).toBe('206 279 490');
    // One "prestige now", one "finish the current run first", different counts: no route is in both,
    // so no plan needs a tag.
    expect(top.plans.every(p => p.tags.length === 0)).toBe(true);
    for (let i = 1; i < top.plans.length; i++)
      expect(top.plans[i].finish).toBeGreaterThanOrEqual(top.plans[i - 1].finish);
    const bestM1 = top.plans.find(p => p.id === '16f9fe98')!;
    expect(bestM1.chain.join(' ')).toBe('277 490');
    expect((bestM1.finish - m1.start) / DAY_MS).toBeCloseTo(1120.7104, 4);
  });
});

describe.skipIf(!has('2e9fd3b0', '8f4991eb'))('stored tables: a plan the account is on', () => {
  it("replaces Allan's 24 Sep best with the 25 Sep table's measurement of what is left of it", () => {
    // 24 Sep from TE 198: 199 225 255 290 324 490. 25 Sep from TE 199, seeded with the rest of it.
    const top = mergeAccountTables([table('2e9fd3b0'), table('8f4991eb')]);
    const where = top.locate([199, 225, 255, 290, 324, 490], table('2e9fd3b0').settings, '2e9fd3b0')!;
    expect([where.own, where.plan.id, where.plan.chain.join(' ')]).toEqual([false, '8f4991eb', '225 255 290 324 490']);
    const old = table('2e9fd3b0');
    const oldFinish = old.start + old.chains[0].days * DAY_MS;
    // Priced again from the account as it was a day later, the plan finishes a day later.
    expect((where.plan.finish - oldFinish) / DAY_MS).toBeCloseTo(1, 3);
    // First is now a 24 Sep runner-up that ascends at 200, which TE 199 has not passed; the 25 Sep
    // table did not price it, so its 24 Sep measurement stands.
    expect([top.plans[0].id, top.plans[0].chain.join(' '), top.plans[0].passed]).toEqual([
      '2e9fd3b0',
      '200 225 255 290 324 490',
      [],
    ]);
    expect(top.plans.some(p => p.chain.join(' ') === '199 225 255 290 324 490')).toBe(false);
    expect(top.restRepriced).toBeGreaterThanOrEqual(1);
  });
});
