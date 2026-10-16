/**
 * My runs, two reports from the alt account on beta (16 Oct 2026):
 *
 * B1. "Your runs on the board (27)", and the list said "None of your runs are in these categories.
 *     Showing 0 of 25 runs." The default filters keep every row (below, with the filter state exactly as
 *     MyRunsList builds it and as Clear resets it, and with the strings the selects hand back); "Showing
 *     n of m" is only ever printed while a filter narrows the list, so that list had one on. A page's
 *     copied text lists every option of a select, never the chosen one, which is how "Kind = All" read.
 *     Fixed: the empty list now names the filters on and offers "Show them all", and the header, the
 *     list and "Showing n of m" all count runs (a result sent twice is one), saying the sends apart.
 * B2. The cards missed the newest runs: a named run from another browser or site carries that browser's
 *     code and was never a "maybe"; a run from an earlier save's gear never matched the save loaded now.
 *     Fixed: any of the account's keys, and a named run whose name is the account's own.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MY_RUNS_FILTERS,
  activeFilterCount,
  activeFilterWords,
  inMyRunsFilters,
  isMyRun,
  lastSentMs,
  missReasons,
  myRunsCount,
  nameKeys,
  rowsById,
  whyNotMine,
  type KindFilter,
  type HoursFilter,
  type MyRunsFilters,
} from './myRuns';
import { foldCopies, type BoardRow } from './leaderboardRank';

import { EGG_DAY, GEAR_OCT10, KEY_NOW, KEY_OCT10, egg, mix } from '@/test/myRunsMix';

const numberOrNull = (v: string): number | null => (v ? Number(v) : null);

describe('B1: Kind = All with the default filters lists every run', () => {
  const rows = mix();
  const kept = (f: MyRunsFilters) => rows.filter(r => inMyRunsFilters(r, f, EGG_DAY));

  it('the fixture is 27 sends of 25 runs, as on the report', () => {
    expect(rows).toHaveLength(27);
    expect(foldCopies(rows)).toHaveLength(25);
    expect(myRunsCount(rows)).toBe(25);
  });

  it('the state MyRunsList starts from, and the one Clear resets to, keep every row (Egg Day, other targets and dates, hidden, maybe, provisional)', () => {
    const initial: Partial<MyRunsFilters> | undefined = undefined;
    const start: MyRunsFilters = { ...DEFAULT_MY_RUNS_FILTERS, ...(initial ?? {}) };
    const cleared: MyRunsFilters = { ...DEFAULT_MY_RUNS_FILTERS, sort: 'newest' };
    expect(kept(start)).toHaveLength(27);
    expect(kept(cleared)).toHaveLength(27);
    expect(activeFilterCount(start)).toBe(0);
    expect(activeFilterWords(start, 2027)).toEqual([]);
  });

  it('the strings the selects hand back mean the same ("all", "either", an empty Ascensions)', () => {
    const fromSelects: MyRunsFilters = {
      kind: 'all' as KindFilter,
      target: null,
      hours: 'either' as HoursFilter,
      // MyRunsFilters.vue `numberOrNull`: the "any" option's value is ''.
      ascensions: numberOrNull(''),
      stops: '',
      sort: 'best',
    };
    expect(kept(fromSelects)).toHaveLength(27);
    // Race's target left over from an earlier choice narrows nothing under All.
    expect(kept({ ...fromSelects, target: 490 })).toHaveLength(27);
  });

  it('only a filter on can empty the list, and the empty list says which', () => {
    const narrow: MyRunsFilters = { ...DEFAULT_MY_RUNS_FILTERS, ascensions: 7 };
    expect(kept(narrow)).toHaveLength(0);
    expect(activeFilterCount(narrow)).toBe(1);
    expect(activeFilterWords(narrow, 2027)).toEqual(['7 ascensions']);
    expect(
      activeFilterWords(
        { ...DEFAULT_MY_RUNS_FILTERS, kind: 'race', target: 490, hours: 'awake', stops: '200, 250' },
        2027
      )
    ).toEqual(['Race to 490', 'my awake hours', 'stops 200 250']);
    expect(
      activeFilterWords({ ...DEFAULT_MY_RUNS_FILTERS, kind: 'eggday', hours: 'any', ascensions: 1 }, 2027)
    ).toEqual(['Egg Day 2027', 'any time of day', '1 ascension']);
  });
});

describe("B2: which runs are the viewer's", () => {
  // The alt's Egg Day runs as reported: 246 (Oct 9, looks like yours), then four at 248.
  const r246 = egg(246, '2026-10-09T12:00:00Z');
  const pcA = egg(248, '2026-10-11T12:00:00Z', { nickname: 'AltName', acct: 'pc0000000001', effort: 'exhaustive' });
  const pcB = egg(248, '2026-10-11T13:00:00Z', {
    nickname: 'AltName',
    acct: 'pc0000000001',
    effort: 'exhaustive',
    startLocal: '2026-10-11 08:00',
  });
  const oct10 = egg(248, '2026-10-12T12:00:00Z', { nickname: 'AltName', acct: 'site00000002', artifacts: GEAR_OCT10 });
  const anonNow = egg(248, '2026-10-15T15:00:00Z', { startLocal: '2026-10-15 09:00' });
  const save = (over: Partial<{ keys: Set<string>; names: Set<string>; viewerTE: number }> = {}) => ({
    keys: new Set([KEY_NOW]),
    names: new Set<string>(),
    viewerTE: 190,
    ...over,
  });
  const mine = (r: BoardRow, l = save()) => isMyRun(r, l.keys, l.viewerTE, l.names);

  it('the old rule: the current save key only, never a row with an owner code', () => {
    expect(mine(r246)).toBe(true);
    expect(mine(anonNow)).toBe(true);
    // Named runs from the PC's browser (or another site) carry that browser's code.
    expect(mine(pcA)).toBe(false);
    expect(missReasons(pcA, save())).toEqual(['other-code']);
    // A named run from the Oct 10 save: another code, and the gear moved on since.
    expect(missReasons(oct10, save())).toEqual(['other-code', 'key']);
  });

  it("a named run from another browser counts as a look-alike when its name is the account's own", () => {
    const names = nameKeys(['AltName', undefined, '']);
    expect(mine(pcA, save({ names }))).toBe(true);
    expect(mine(pcB, save({ names }))).toBe(true);
    // Case and spacing as the board files names.
    expect(mine(pcA, save({ names: nameKeys([' altname ']) }))).toBe(true);
    // Someone else's name with the same gear stays out.
    expect(mine({ ...pcA, nickname: 'Stranger' }, save({ names }))).toBe(false);
  });

  it("a run from an earlier save matches once the account's earlier key is known (remembered, or a /mine row's)", () => {
    const names = nameKeys(['AltName']);
    // Unnamed (any name not the account's): only an exact key counts, so the earlier key is needed.
    const anonOct10 = { ...oct10, nickname: undefined, acct: undefined };
    expect(mine(anonOct10, save({ names }))).toBe(false);
    expect(mine(anonOct10, save({ names, keys: new Set([KEY_NOW, KEY_OCT10]) }))).toBe(true);
    // Under the account's own name a one-item gear change is near enough (fix 20, lib/myRuns.ts `nearKey`).
    expect(mine(oct10, save({ names }))).toBe(true);
    expect(mine(oct10, save({ names, keys: new Set([KEY_NOW, KEY_OCT10]) }))).toBe(true);
    // Never one from a TE above the save's.
    expect(mine({ ...oct10, backupTE: 200 }, save({ names, keys: new Set([KEY_NOW, KEY_OCT10]) }))).toBe(false);
  });

  it('the old call shape (one key or none) still works', () => {
    expect(isMyRun(r246, KEY_NOW, 190)).toBe(true);
    expect(isMyRun(r246, null, 190)).toBe(false);
    expect(isMyRun({ ...r246, yours: true }, null, 0)).toBe(true);
  });

  it('with the fix the Egg Day best is 248, and the newest send is Oct 15', () => {
    const rows = [r246, pcA, pcB, oct10, anonNow];
    const l = save({ names: nameKeys(['AltName']), keys: new Set([KEY_NOW, KEY_OCT10]) });
    const listed = rows.filter(r => mine(r, l));
    expect(listed).toHaveLength(5);
    expect(Math.max(...listed.map(r => r.finalTE))).toBe(248);
    expect(new Date(lastSentMs(listed) as number).toISOString()).toBe('2026-10-15T15:00:00.000Z');
  });

  it('lastSentMs: the newest copy, by the collector stamp, else the sender clock', () => {
    expect(lastSentMs([])).toBeNull();
    expect(
      lastSentMs([
        { ...r246, receivedAt: '2026-10-12T00:00:00Z' },
        { ...r246, receivedAt: undefined, submittedAt: '2026-10-15T00:00:00Z' },
      ])
    ).toBe(Date.parse('2026-10-15T00:00:00Z'));
  });
});

describe('"A run of yours isn\'t here?"', () => {
  const ctx = { keys: new Set([KEY_NOW]), names: new Set<string>(), viewerTE: 190, saveKey: KEY_NOW, hasCode: true };
  const join = (lines: string[]) => lines.join(' ');

  it('finds rows by the first characters of the id, any case, at least six', () => {
    const rows = [
      egg(248, '2026-10-15T00:00:00Z', { id: 'abc123def4567' }),
      egg(246, '2026-10-09T00:00:00Z', { id: 'fed987cba000' }),
    ];
    expect(rowsById(rows, 'ABC123')).toHaveLength(1);
    expect(rowsById(rows, 'abc12')).toHaveLength(0);
    expect(rowsById([...rows, rows[0]], 'abc123de')).toHaveLength(1);
  });

  it('says why each kind of row is or is not listed', () => {
    expect(join(whyNotMine(null, ctx))).toContain('No run on the public board has that id');
    expect(join(whyNotMine({ ...egg(248, 'x'), yours: true }, ctx))).toContain('this browser sent it');
    expect(join(whyNotMine(egg(248, 'x'), ctx))).toContain('maybe you');
    expect(join(whyNotMine(egg(248, 'x', { nickname: 'AltName', acct: 'pc0000000001' }), ctx))).toContain(
      'as “AltName” from another browser or site'
    );
    expect(join(whyNotMine(egg(248, 'x', { timezone: 'Europe/London' }), ctx))).toContain(
      'timezone Europe/London; your planner is set to America/Chicago'
    );
    expect(join(whyNotMine(egg(248, 'x', { artifacts: GEAR_OCT10 }), ctx))).toContain(
      'it has T4E Necklace; your save has T4L Necklace'
    );
    expect(join(whyNotMine(egg(248, 'x', { backupTE: 200 }), ctx))).toContain('above your save’s 190');
    expect(join(whyNotMine(egg(248, 'x', { artifacts: GEAR_OCT10 }), { ...ctx, saveKey: null }))).toContain(
      'Load your save'
    );
  });

  it('says when this site in this browser holds no code for the account', () => {
    const lines = whyNotMine(egg(248, 'x'), { ...ctx, hasCode: false });
    expect(join(lines)).toContain('has never sent a run for this account');
    expect(join(lines)).toContain('each site (the planner and its beta), keeps its own code');
  });
});
