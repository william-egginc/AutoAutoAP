/** My runs' filters and sort (lib/myRuns.ts): everything by default, best first per kind. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MY_RUNS_FILTERS,
  activeFilterCount,
  compareBest,
  hasStops,
  inMyRunsFilters,
  isMyRun,
  parseStops,
  raceTargets,
  runKind,
  sortMyRuns,
  type MyRunsFilters,
} from './myRuns';
import { accountKeyOf, type BoardRow } from './leaderboardRank';

const EGG_DAY = 1_815_840_000; // a stand-in for Egg Day's moment (unix seconds)
const OTHER_DATE = 1_800_000_000;

/** A race run to `finalTE`, starting `start` (UTC) and lasting `days`. */
const race = (finalTE: number, chain: number[], days: number, extra: Partial<BoardRow> = {}): BoardRow => ({
  id: `r${finalTE}-${chain.join('-')}-${days}`,
  chain,
  finalTE,
  durationDays: days,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});

/** A date answer reaching `te`, its last ascension `spareH` hours before the deadline. */
const dated = (
  deadline: number,
  te: number,
  chain: number[],
  spareH: number,
  extra: Partial<BoardRow> = {}
): BoardRow => ({
  id: `d${deadline}-${te}-${spareH}`,
  chain,
  finalTE: te,
  durationDays: 10,
  deadline,
  deadlineAscendAt: deadline - spareH * 3600,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-02T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});

const f = (over: Partial<MyRunsFilters>): MyRunsFilters => ({ ...DEFAULT_MY_RUNS_FILTERS, ...over });

describe('which runs are mine', () => {
  const key = accountKeyOf({ timezone: 'UTC', artifacts: ['T4L Gusset'] });
  const looksMine = race(490, [300, 490], 20, { artifacts: ['T4L Gusset'], currentTE: 250 });

  it('every run /mine returned, whatever it carries', () => {
    expect(isMyRun({ ...looksMine, yours: true, acct: 'abc123abc123', timezone: 'Asia/Tokyo' }, null, 0)).toBe(true);
  });

  it("an older run with the save's timezone and artifacts, but never one with another owner code or a higher TE", () => {
    expect(isMyRun(looksMine, key, 260)).toBe(true);
    expect(isMyRun(looksMine, key, 0)).toBe(true);
    expect(isMyRun({ ...looksMine, acct: 'abc123abc123' }, key, 260)).toBe(false);
    expect(isMyRun({ ...looksMine, currentTE: 270 }, key, 260)).toBe(false);
    expect(isMyRun({ ...looksMine, timezone: 'Asia/Tokyo' }, key, 260)).toBe(false);
    expect(isMyRun(looksMine, null, 260)).toBe(false);
  });
});

describe('kinds', () => {
  it('Egg Day by its moment, other dates By a date, the rest races', () => {
    expect(runKind(dated(EGG_DAY, 300, [300], 2), EGG_DAY)).toBe('eggday');
    expect(runKind(dated(OTHER_DATE, 300, [300], 2), EGG_DAY)).toBe('dates');
    expect(runKind(race(490, [490], 20), EGG_DAY)).toBe('race');
  });

  it('race targets from the races only, lowest first', () => {
    expect(
      raceTargets([race(490, [490], 1), race(300, [300], 1), dated(EGG_DAY, 307, [307], 1), race(490, [400, 490], 1)])
    ).toEqual([300, 490]);
  });
});

describe('filters', () => {
  const rows = [
    race(490, [250, 300, 490], 20, { window: 'every day 07:00-23:00 UTC' }),
    race(300, [200, 300], 10),
    dated(EGG_DAY, 320, [200, 250, 320], 5),
    dated(OTHER_DATE, 280, [280], 1, { window: 'every day 08:00-22:00 UTC' }),
  ];
  const kept = (over: Partial<MyRunsFilters>) => rows.filter(r => inMyRunsFilters(r, f(over), EGG_DAY)).map(r => r.id);

  it("shows everything by default (the tester's Egg Day answer included)", () => {
    expect(kept({})).toEqual(rows.map(r => r.id));
    expect(activeFilterCount(DEFAULT_MY_RUNS_FILTERS)).toBe(0);
  });

  it("Kind, and Race's target", () => {
    expect(kept({ kind: 'eggday' })).toEqual([rows[2].id]);
    expect(kept({ kind: 'dates' })).toEqual([rows[3].id]);
    expect(kept({ kind: 'race' })).toEqual([rows[0].id, rows[1].id]);
    expect(kept({ kind: 'race', target: 490 })).toEqual([rows[0].id]);
    // The target means nothing to the other kinds.
    expect(kept({ kind: 'all', target: 490 })).toEqual(rows.map(r => r.id));
  });

  it('Awake hours, as Compare reads them: a schedule sent, or none', () => {
    expect(kept({ hours: 'awake' })).toEqual([rows[0].id, rows[3].id]);
    expect(kept({ hours: 'any' })).toEqual([rows[1].id, rows[2].id]);
  });

  it("Ascensions is the route's length", () => {
    expect(kept({ ascensions: 3 })).toEqual([rows[0].id, rows[2].id]);
    expect(kept({ ascensions: 1 })).toEqual([rows[3].id]);
  });

  it('Stops: every number typed is a stop of the route', () => {
    expect(parseStops('200 250')).toEqual([200, 250]);
    expect(parseStops(' 200,250; x ')).toEqual([200, 250]);
    expect(parseStops('')).toEqual([]);
    expect(hasStops({ chain: [200, 250, 320] }, [250, 200])).toBe(true);
    expect(hasStops({ chain: [200, 300] }, [200, 250])).toBe(false);
    expect(kept({ stops: '200 250' })).toEqual([rows[2].id]);
    expect(kept({ stops: '300' })).toEqual([rows[0].id, rows[1].id]);
  });

  it('counts the filters in use (Kind and its target once; the sort is not a filter)', () => {
    expect(activeFilterCount(f({ kind: 'race', target: 490 }))).toBe(1);
    expect(activeFilterCount(f({ hours: 'awake', ascensions: 4, stops: '250' }))).toBe(3);
    expect(activeFilterCount(f({ stops: ' , ' }))).toBe(0);
    expect(activeFilterCount(f({ sort: 'newest' }))).toBe(0);
  });
});

describe('sort', () => {
  const id = (r: BoardRow) => r.id;

  it('best first: Egg Day, then other dates soonest first, then races by target; each by its own best', () => {
    const eggLow = dated(EGG_DAY, 300, [300], 10);
    const eggHighLessSpare = dated(EGG_DAY, 320, [320], 1);
    const eggHighMoreSpare = dated(EGG_DAY, 320, [250, 320], 8);
    const eggMissed = dated(EGG_DAY, 400, [400], -5);
    const other = dated(OTHER_DATE, 280, [280], 1);
    const race490slow = race(490, [490], 30);
    const race490fast = race(490, [300, 490], 20);
    const race300 = race(300, [300], 50);
    const sorted = sortMyRuns(
      [race490slow, eggLow, race300, eggMissed, other, eggHighLessSpare, race490fast, eggHighMoreSpare],
      r => r,
      'best',
      EGG_DAY
    );
    expect(sorted.map(id)).toEqual(
      [eggHighMoreSpare, eggHighLessSpare, eggLow, eggMissed, other, race300, race490fast, race490slow].map(id)
    );
  });

  it('newest sent, fewest ascensions, finish date', () => {
    const a = race(490, [200, 300, 490], 20, { submittedAt: '2026-10-05T00:00:00Z' });
    const b = race(490, [490], 30, { submittedAt: '2026-10-07T00:00:00Z' });
    const c = race(490, [300, 490], 10, { submittedAt: '2026-10-06T00:00:00Z' });
    expect(sortMyRuns([a, b, c], r => r, 'newest', EGG_DAY).map(id)).toEqual([b, c, a].map(id));
    expect(sortMyRuns([a, b, c], r => r, 'fewest', EGG_DAY).map(id)).toEqual([b, c, a].map(id));
    expect(sortMyRuns([a, b, c], r => r, 'finish', EGG_DAY).map(id)).toEqual([c, a, b].map(id));
  });

  it('a race run with no finish goes after the ones that have one', () => {
    const known = race(490, [490], 20);
    const unknown = { ...race(490, [300, 490], 10), startUtc: undefined, startLocal: undefined };
    expect(compareBest(unknown, known, EGG_DAY)).toBeGreaterThan(0);
  });
});
