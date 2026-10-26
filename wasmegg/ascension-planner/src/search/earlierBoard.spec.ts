/**
 * Light's earlier routes read the account's board runs as My runs does (18 Oct 2026, the alt on beta).
 *
 * The report: Light said "Your earlier routes: None" and ended on 247 (165 200 223 247), while the alt had a
 * Fast run on the save loaded now reaching 248 (165 200 224 248, about 10 h to spare) and a 161 198 218 248
 * run, both sent from the PC under the account's name. Light read GET /mine only, which answers for this
 * site's code in this browser; those runs carry the PC's code, so they never came back. Now Light reads
 * /all and /mine merged and keeps `isMyRun` rows (search/myBoardRows.ts), the same set My runs lists.
 * Made-up rows; no player ID anywhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKeyOf, type BoardRow } from '@/lib/leaderboardRank';
import {
  ALL_FRESH_MS,
  forgetAll,
  lookAlikeFor,
  mergeMine,
  myBoardRows,
  readMyBoardRows,
  recentAll,
  rememberAll,
} from './myBoardRows';
import {
  boardOrder,
  earlierFromText,
  earlierRoutes,
  onCurrentSave,
  priceEarlier,
  sourceLabel,
  type Goal,
  type Priced,
} from './strongerCheck';
import { lightBest } from './lightResult';

const ZONE = 'America/Chicago';
const GEAR = ['T4L Gusset', 'T4L Necklace', 'T4L Ankh'];
const KEY = accountKeyOf({ timezone: ZONE, artifacts: GEAR });
const DEADLINE = 1_815_840_000;
const HOUR = 3600;
const TE_NOW = 160;
const DATE: Goal = { kind: 'date', deadline: DEADLINE };
/** The PC's code, as /all shows it on a named row (an HMAC tag, not the code). */
const PC_ACCT = 'abc123def456';

const row = (id: string, chain: number[], over: Partial<BoardRow> = {}): BoardRow => ({
  id,
  chain,
  finalTE: chain[chain.length - 1],
  durationDays: 60,
  deadline: DEADLINE,
  deadlineAscendAt: DEADLINE - 10 * HOUR,
  timezone: ZONE,
  artifacts: GEAR,
  currentTE: TE_NOW,
  backupTE: TE_NOW,
  nickname: 'AltPlayer',
  receivedAt: '2026-10-17T12:00:00Z',
  ...over,
});

/** The board as /all shows it. */
const ALL: BoardRow[] = [
  // Fast, on the save loaded now, from the PC: 248 with ~10 h to spare.
  row('fast248aaaa', [165, 200, 224, 248], { acct: PC_ACCT, level: 'quick' }),
  // An older save's run, from the PC too.
  row('old248aaaa', [161, 198, 218, 248], {
    acct: PC_ACCT,
    backupTE: 150,
    currentTE: 150,
    receivedAt: '2026-10-12T12:00:00Z',
  }),
  // This browser's own 247 run (/mine returns it too).
  row('mine247aaaa', [166, 201, 223, 247], { acct: 'feedfacecafe' }),
  // Someone else's: other gear, other name.
  row('other250aaa', [165, 205, 230, 250], { acct: '0123456789ab', nickname: 'Someone', artifacts: ['T4L Gusset'] }),
  // The same gear and zone under another name with its own code: not the account's.
  row('twin249aaaa', [165, 204, 228, 249], { acct: '999999999999', nickname: 'Twin' }),
];
/** GET /mine on beta: only the run sent from this browser. */
const MINE: BoardRow[] = [{ ...ALL[2], yours: true }];

const look = (mine: readonly BoardRow[] | null) =>
  lookAlikeFor({ saveKey: KEY, remembered: [], mine, names: ['AltPlayer', ''], viewerTE: TE_NOW });

describe("the rows Light now reads are My runs' rows", () => {
  it('/mine alone (before) had only the 247 run', () => {
    const before = earlierRoutes({ goal: DATE, currentTE: TE_NOW, board: MINE, exclude: [[165, 200, 223, 247]] });
    expect(before.map(r => r.chain.join(' '))).toEqual(['166 201 223 247']);
  });

  it('merged and matched: the PC runs come in under the account name and key, the others stay out', () => {
    const rows = myBoardRows(ALL, MINE, look(MINE));
    expect(rows.map(r => r.id).sort()).toEqual(['fast248aaaa', 'mine247aaaa', 'old248aaaa']);
    expect(rows.find(r => r.id === 'mine247aaaa')?.yours).toBe(true);
    expect(rows.find(r => r.id === 'fast248aaaa')?.yours).toBeUndefined();
  });

  it('without a save there are no look-alikes (only /mine)', () => {
    const l = lookAlikeFor({ saveKey: null, remembered: [KEY], mine: MINE, names: ['AltPlayer'], viewerTE: 0 });
    expect(myBoardRows(ALL, MINE, l).map(r => r.id)).toEqual(['mine247aaaa']);
  });

  it('mergeMine adds a hidden /mine run /all does not show, once', () => {
    const hidden = row('hidden1aaaa', [170, 210, 246], { yours: true, hidden: true });
    const merged = mergeMine(ALL, [...MINE, hidden]);
    expect(merged.filter(r => r.id === 'mine247aaaa')).toHaveLength(1);
    expect(merged.some(r => r.id === 'hidden1aaaa')).toBe(true);
  });
});

describe("Light's candidate list and its order", () => {
  const board = myBoardRows(ALL, MINE, look(MINE));
  // The instant answer's rows Light prices anyway (here the 247 the report ended on).
  const exclude = [[165, 200, 223, 247]];

  it("the save loaded now first, then the best by the run's own result; each route once", () => {
    expect(onCurrentSave(ALL[0], TE_NOW)).toBe(true);
    expect(onCurrentSave(ALL[1], TE_NOW)).toBe(false);
    expect(boardOrder(board, DATE, TE_NOW).map(r => r.id)).toEqual(['fast248aaaa', 'mine247aaaa', 'old248aaaa']);
    const twice = [...board, { ...ALL[0], id: 'copyaaaaaa' }];
    const r = earlierRoutes({ goal: DATE, currentTE: TE_NOW, board: twice, exclude });
    expect(r.map(x => [x.source, x.chain.join(' ')])).toEqual([
      ['board-other', '165 200 224 248'],
      ['board', '166 201 223 247'],
      ['board-other', '161 198 218 248'],
    ]);
  });

  it('another date is another goal; the cap still holds', () => {
    const elsewhere = board.map(r => ({ ...r, deadline: DEADLINE + 5 * 86400 }));
    expect(earlierRoutes({ goal: DATE, currentTE: TE_NOW, board: elsewhere })).toEqual([]);
    expect(earlierRoutes({ goal: DATE, currentTE: TE_NOW, board, max: 1 }).map(r => r.chain.join(' '))).toEqual([
      '165 200 224 248',
    ]);
  });

  it('says where they came from', () => {
    const r = earlierRoutes({ goal: DATE, currentTE: TE_NOW, board, exclude });
    expect(earlierFromText(r)).toBe('from your Leaderboard runs, 2 of them sent from another browser');
    expect(earlierFromText(r.filter(x => x.source === 'board-other'))).toBe(
      'from your Leaderboard runs sent from another browser'
    );
    expect(
      earlierFromText([
        { chain: [1], source: 'board-other' },
        { chain: [2], source: 'saved-answer' },
      ])
    ).toBe('from your Leaderboard run sent from another browser and your saved answer');
    expect(earlierFromText([])).toBe('');
    expect(sourceLabel(r[0], t => `T${t}`)).toBe(
      `your Leaderboard run, sent T${Date.parse('2026-10-17T12:00:00Z')} from another browser`
    );
  });

  it("after (mocked) re-pricing on this save, Light ends on the 248, not the instant answer's 247", async () => {
    const r = earlierRoutes({ goal: DATE, currentTE: TE_NOW, board, exclude });
    const p = (chain: number[], spareHours: number): Priced => ({
      chain,
      seconds: 1000,
      end: DEADLINE - spareHours * HOUR,
      endTE: chain[chain.length - 1],
    });
    // The full simulator's answers, made up: the old save's 248 misses the date now, the Fast one makes it.
    const prices: Record<string, Priced> = {
      '165,200,224,248': p([165, 200, 224, 248], 10),
      '166,201,223,247': p([166, 201, 223, 247], 30),
      '161,198,218,248': p([161, 198, 218, 248], -5),
    };
    const got = await priceEarlier({
      goal: DATE,
      routes: r,
      currentTE: TE_NOW,
      price: async chains => new Map(chains.map(c => [c.join(','), prices[c.join(',')] ?? null])),
    });
    const best = lightBest({
      goal: DATE,
      atOnce: [p([165, 200, 223, 247], 20)],
      earlier: got.map(e => e.made),
      planStart: DEADLINE - 60 * 86400,
    });
    expect(best?.best.chain).toEqual([165, 200, 224, 248]);
    expect(best?.best.from).toBe('earlier');
  });
});

describe("readMyBoardRows: one fetch layer, the board's /all reused for a minute", () => {
  const calls: string[] = [];
  beforeEach(() => {
    forgetAll();
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url.replace('https://c.example', ''));
      const body = url.endsWith('/mine')
        ? { rows: MINE.map(r => ({ ...r, yours: undefined })) }
        : { rows: ALL, builtAt: 1 };
      return { ok: true, json: async () => body } as Response;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetAll();
  });

  it("reads /mine and /all and returns the account's rows, /mine's marked yours", async () => {
    const rows = await readMyBoardRows({ root: 'https://c.example', token: 'a'.repeat(32), look });
    expect(calls.sort()).toEqual(['/all', '/mine']);
    expect(rows.map(r => r.id).sort()).toEqual(['fast248aaaa', 'mine247aaaa', 'old248aaaa']);
    expect(rows.find(r => r.id === 'mine247aaaa')?.yours).toBe(true);
  });

  it('a board /all under a minute old is reused; without a code /mine is not asked', async () => {
    rememberAll('https://c.example', ALL, 1_000);
    const rows = await readMyBoardRows({ root: 'https://c.example', token: null, look, now: 1_000 + ALL_FRESH_MS - 1 });
    expect(calls).toEqual([]);
    expect(rows.map(r => r.id).sort()).toEqual(['fast248aaaa', 'mine247aaaa', 'old248aaaa']);
    expect(recentAll('https://c.example', ALL_FRESH_MS, 1_000 + ALL_FRESH_MS + 1)).toBeNull();
  });

  it("a board that cannot be read leaves /mine's rows", async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/mine')
        ? ({ ok: true, json: async () => ({ rows: MINE }) } as Response)
        : ({ ok: false, status: 503, json: async () => ({}) } as Response)
    );
    const rows = await readMyBoardRows({ root: 'https://c.example', token: 'a'.repeat(32), look });
    expect(rows.map(r => r.id)).toEqual(['mine247aaaa']);
  });
});

describe('the sources wire through', () => {
  it('the board panel reads the account\'s runs through search/myBoardRows.ts (StrongerCheck.vue, gone 23 Oct 2026, did too)', async () => {
    const fs = await import('node:fs');
    const board = fs.readFileSync(new URL('../components/auto/LeaderboardPanel.vue', import.meta.url), 'utf8');
    expect(board).toContain('rememberAll(root.value, rows)');
    expect(board).toContain('lookAlikeFor(');
    expect(board).toContain('mergeMine(');
  });
});
