/**
 * Sparse and odd collector rows (prelive, 21 Oct 2026). Anyone can post a bare row, and older or Light rows
 * lack fields; one row without `chainsPriced` made Insights throw for every viewer. Every row now goes through
 * `normalizeBoardRows` where it enters (/all, /flagged, /mine), and Insights and the Leaderboard must then
 * neither throw nor reorder the good rows.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { normalizeBoardRow, normalizeBoardRows, routesText } from './boardRowGuard';
import {
  buildDeadlineBoard,
  buildRace,
  foldCopies,
  groupPlayers,
  hiddenRuns,
  publicRows,
  settingTags,
  type BoardRow,
} from './leaderboardRank';
import type { CollectorRow } from '@/explorer/collector';
import {
  accountOrder,
  assessFinishes,
  bestPerCount,
  finishJudgement,
  flagOf,
  foldRuns,
  groupByAccount,
  groupByCount,
  isProof,
  rateCheckOf,
  runsByAccount,
  runTags,
  searchedOf,
  summariseRuns,
  targetsPresent,
  whatIfIds,
} from '@/explorer/analysis';
import { knowStats } from '@/explorer/knowStats';
import LeaderboardRunDetail from '@/components/auto/LeaderboardRunDetail.vue';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const GEAR = ['T4L Book of Basan 0', 'T4L Gusset', 'T4L Ship in a bottle'];

function good(id: string, nickname: string, durationDays: number): Record<string, unknown> {
  return {
    id,
    schema: 8,
    nickname,
    timezone: 'America/Los_Angeles',
    artifacts: GEAR,
    stones: [{ label: 'T4 Quantum stone', count: 3 }],
    chain: [280, 350, 420, 490],
    ascensions: 4,
    currentTE: 250,
    finalTE: 490,
    durationDays,
    startLocal: '2026-10-13 11:30',
    endLocal: '2026-10-31 11:30',
    startUtc: '2026-10-13T18:30:00.000Z',
    submittedAt: '2026-10-13T18:00:00.000Z',
    receivedAt: '2026-10-13T18:00:05.000Z',
    effort: 'balanced',
    window: null,
    holdShifts: false,
    waitingHours: 0.4,
    legs: [{ te: 490, strategy: '2-sale', days: durationDays, peakDeliveryQph: 1 }],
    chainsPriced: 1234,
    run: { workers: 4, cores: 8, minutes: 12 },
    build: 'fixture',
    simVersion: '2026-10-21-egg-beta2',
  };
}

/** Sparse and wrong-typed rows, as a bare POST or an old row could send them. */
const SPARSE: unknown[] = [
  // Kept, filled in: no chainsPriced, chainsEvaluated, simVersion, plans, times, name, gear, arrays.
  { id: 'bare1', chain: [300, 490], durationDays: 30 },
  // Numbers as strings, NaN, nulls, objects where arrays go.
  {
    id: 'odd1',
    nickname: 'oddone',
    chain: ['300', 400, 490],
    durationDays: '25.5',
    currentTE: 'NaN',
    finalTE: null,
    chainsPriced: 'lots',
    ascensions: NaN,
    artifacts: 'T4L Gusset',
    stones: { a: 1 },
    legs: [null, 5, { te: '490', days: 'x' }],
    window: 7,
    waitingHours: 'soon',
    submittedAt: 12,
    receivedAt: null,
    startUtc: 5,
    timezone: null,
    simVersion: 3,
    rechecks: [{ chain: [1, 'x'], days: 2 }, 'nope'],
    timeOff: [{ from: 1 }, { from: '2026-10-14', to: '2026-10-15' }],
    run: { minutes: 'x' },
    space: { chains: null, stoppedEarly: 'no' },
    proof: { spread: null, runnersUp: 'x' },
    sweep: { preset: 5, bands: [1] },
    flags: 'x',
    seed: ['a'],
    deadline: 'soon',
  },
  // A space with its counts as strings, and a proof missing its lists.
  {
    id: 'odd2',
    nickname: 'spacey',
    chain: [300, 490],
    durationDays: 40,
    space: { chains: '10', chainsPriced: undefined, bands: 'x', minAscensions: 1, maxAscensions: 2, mode: 'bands' },
    proof: { spread: { median: 41, worst: 50 } },
  },
  // Dropped: too bare to mean anything.
  null,
  5,
  'row',
  [],
  {},
  { id: 'nochain', durationDays: 3 },
  { id: 'shortchain', chain: [], durationDays: 3 },
  { id: 'badchain', chain: [300, 'x'], durationDays: 3 },
  { id: 'notime', chain: [300, 490] },
  { id: 'nantime', chain: [300, 490], durationDays: NaN },
  { id: 'negtime', chain: [300, 490], durationDays: -1 },
];
const DROPPED = ['nochain', 'shortchain', 'badchain', 'notime', 'nantime', 'negtime'];

const GOOD = [good('g1', 'alpha', 20), good('g2', 'bravo', 18), good('g3', 'charlie', 25)];

describe('normalizeBoardRow', () => {
  it('drops rows with no route or no length, and keeps the rest', () => {
    const rows = normalizeBoardRows<BoardRow>([...GOOD, ...SPARSE]);
    const ids = rows.map(r => r.id);
    expect(ids).toEqual(['g1', 'g2', 'g3', 'bare1', 'odd1', 'odd2']);
    for (const d of DROPPED) expect(ids).not.toContain(d);
    expect(normalizeBoardRows('x')).toEqual([]);
  });

  it('passes a full row through unchanged', () => {
    expect(normalizeBoardRow(GOOD[0])).toEqual(GOOD[0]);
  });

  it('fills what every row must have, and removes optional fields of the wrong type', () => {
    const bare = normalizeBoardRow<CollectorRow>(SPARSE[0])!;
    expect(bare).toMatchObject({
      chainsPriced: 0,
      currentTE: 300,
      finalTE: 490,
      ascensions: 1,
      artifacts: [],
      stones: [],
      legs: [],
      window: null,
      waitingHours: null,
      holdShifts: false,
      timezone: '',
      submittedAt: '',
      effort: '',
    });
    const odd = normalizeBoardRow<CollectorRow>(SPARSE[1])!;
    expect(odd.chain).toEqual([300, 400, 490]);
    expect(odd.durationDays).toBe(25.5);
    expect([odd.currentTE, odd.finalTE, odd.ascensions, odd.chainsPriced]).toEqual([300, 490, 2, 0]);
    expect(odd.artifacts).toEqual([]);
    expect(odd.stones).toEqual([]);
    expect(odd.legs).toEqual([{ te: 490, strategy: '', days: 0, peakDeliveryQph: 0 }]);
    expect(odd.rechecks).toEqual([]);
    expect(odd.timeOff).toEqual([{ from: '2026-10-14', to: '2026-10-15' }]);
    for (const k of ['receivedAt', 'startUtc', 'simVersion', 'run', 'space', 'proof', 'flags', 'seed', 'deadline'])
      expect(odd, k).not.toHaveProperty(k);
    expect(odd.sweep).toEqual({ preset: '' });
    const spacey = normalizeBoardRow<CollectorRow>(SPARSE[2])!;
    expect(spacey.space).toMatchObject({ chains: 10, chainsPriced: 0, stoppedEarly: false });
    expect(spacey.space).not.toHaveProperty('bands');
    expect(spacey.proof).toMatchObject({ runnersUp: [], byAscensions: [], spread: { median: 41, worst: 50 } });
  });

  it('a route count the row did not give shows as –', () => {
    expect(routesText(0)).toBe('–');
    expect(routesText(undefined)).toBe('–');
    expect(routesText(NaN)).toBe('–');
    expect(routesText(1234)).toBe((1234).toLocaleString());
  });
});

/** Every Insights and Leaderboard computation the pages run over the rows. */
function runEverything(rows: CollectorRow[]) {
  const assessed = assessFinishes(rows, 490, NOW);
  const judged = finishJudgement(assessed);
  const order = accountOrder(rows);
  const insights = {
    summary: summariseRuns(rows),
    counts: groupByCount(rows),
    accounts: groupByAccount(rows),
    folded: foldRuns(rows),
    tags: runTags(rows),
    targets: targetsPresent(rows),
    byAccount: runsByAccount(rows, judged, new Map(), order),
    best: bestPerCount(rows, judged),
    know: knowStats(rows, judged, whatIfIds([assessed]), [], NOW),
    perRow: rows.map(r => [flagOf(r), rateCheckOf(r), isProof(r), searchedOf(r)]),
  };
  const opts = { target: 490, now: NOW };
  const board = {
    race: buildRace(rows, opts),
    players: groupPlayers(rows, opts),
    deadline: buildDeadlineBoard(rows, { now: NOW }),
    settings: settingTags(rows),
    copies: foldCopies(rows),
    hidden: hiddenRuns(rows),
    shown: publicRows(rows, new Set()),
  };
  return { insights, board };
}

const goodOrder = (rows: CollectorRow[]) =>
  buildRace(rows, { target: 490, now: NOW })
    .entries.map(e => e.best.row.id)
    .filter(id => id.startsWith('g'));

describe('Insights and the Leaderboard with sparse rows', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('nothing throws, and the good rows keep their ranking', () => {
    const goodOnly = normalizeBoardRows<CollectorRow>(GOOD);
    const all = normalizeBoardRows<CollectorRow>([...GOOD, ...SPARSE]);
    expect(() => runEverything(all)).not.toThrow();
    expect(goodOrder(goodOnly)).toEqual(['g2', 'g1', 'g3']);
    expect(goodOrder(all)).toEqual(goodOrder(goodOnly));
  });

  it('every row’s detail renders, a missing count as – and no "undefined" or "NaN"', async () => {
    for (const row of normalizeBoardRows<BoardRow>([...GOOD, ...SPARSE])) {
      const t = textOf(await renderHtml(LeaderboardRunDetail, { row, csvRoot: 'https://collector.example' }));
      expect(t).not.toMatch(/\bundefined\b|\bNaN\b/);
    }
  });

  it('Insights’ routes column reads routesText (no toLocaleString on a missing count)', () => {
    const ex = fs.readFileSync(path.resolve(__dirname, '../explorer/ChainExplorer.vue'), 'utf8');
    expect(ex).toContain('{{ routesText(row.chainsPriced) }}');
    expect(ex).not.toContain('row.chainsPriced.toLocaleString()');
  });

  it('every place rows enter goes through normalizeBoardRows', () => {
    const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
    expect(src('explorer/collector.ts').match(/normalizeBoardRows<CollectorRow>\(/g)).toHaveLength(2); // /all, /flagged
    expect(src('search/myBoardRows.ts').match(/normalizeBoardRows<BoardRow>\(/g)).toHaveLength(2); // /mine, /all
    expect(src('stores/chainSearch.ts')).toContain('return normalizeBoardRows<BoardRow>(');
  });
});

// The 21 Oct simulator-label fixture (rows lacking chainsPriced), where it exists on this machine.
const FIXTURE = path.join(os.homedir(), 'code/aaap-tools/scratch/simlabel-all-fixture.json');
describe.runIf(fs.existsSync(FIXTURE))('the simlabel /all fixture (regression)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('goes through the same path without throwing, every row kept', async () => {
    const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { rows: unknown[] };
    const rows = normalizeBoardRows<CollectorRow>(body.rows);
    expect(rows.length).toBe(body.rows.length);
    expect(rows.some(r => !(body.rows as Record<string, unknown>[]).find(b => b.id === r.id)?.chainsPriced)).toBe(true);
    expect(() => runEverything(rows)).not.toThrow();
    for (const row of rows) {
      expect(routesText(row.chainsPriced)).toBe('–');
      const t = textOf(await renderHtml(LeaderboardRunDetail, { row, csvRoot: 'https://collector.example' }));
      expect(t).not.toMatch(/\bundefined\b|\bNaN\b/);
    }
  });
});
