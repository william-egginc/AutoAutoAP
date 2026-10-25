/**
 * My runs › Your runs' chips (lib/runsExplore.ts): what each chip reads, the chips that exist only for values the
 * runs have, "or" within a group and "and" across, the sorts, Clear filters, and the selection remembered per
 * account (a bare localStorage stub; a storage that throws changes nothing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardRow } from './leaderboardRank';
import {
  MIN_RUNS_FOR_BAR,
  RUNS_EXPLORE_PREFIX,
  activeCount,
  chipGroups,
  clearExplore,
  countWords,
  effectiveSelection,
  emptyExplore,
  factsOf,
  inExplore,
  levelOf,
  parseExplore,
  readExplore,
  sortExplore,
  toggleChip,
  whenOf,
  writeExplore,
  type ExploreContext,
  type RunsExplore,
} from './runsExplore';

const EGG_DAY = 1_815_840_000;
const OTHER = 1_800_000_000;
const NOW = Date.parse('2026-10-24T18:00:00Z');
const ctx: ExploreContext = { eggDayAt: EGG_DAY, eggDayYear: 2027, mainTarget: 490, nowMs: NOW, zone: 'UTC' };

let n = 0;
function row(over: Partial<BoardRow>): BoardRow {
  return {
    id: `r${++n}`,
    chain: [200, 300, 490],
    finalTE: 490,
    durationDays: 20,
    startUtc: '2026-10-01T00:00:00Z',
    timezone: 'UTC',
    receivedAt: '2026-10-24T12:00:00Z',
    ...over,
  };
}
const sel = (o: Partial<RunsExplore> = {}): RunsExplore => ({ ...emptyExplore(), ...o });

const race490 = row({ level: 'quick', window: 'every day 07:00-23:00' });
const race490b = row({ chain: [250, 490], level: 'normal', receivedAt: '2026-10-20T12:00:00Z' });
const race350 = row({ chain: [250, 350], finalTE: 350, level: 'light', atOnce: true, receivedAt: '2026-10-01T12:00:00Z' });
const egg = row({
  chain: [200, 230, 310],
  finalTE: 310,
  deadline: EGG_DAY,
  deadlineAscendAt: EGG_DAY - 3600,
  level: 'exhaustive',
  receivedAt: '2026-09-01T12:00:00Z',
});
const date = row({ chain: [280], finalTE: 280, deadline: OTHER, deadlineAscendAt: OTHER - 3600, mode: 'advanced', receivedAt: '2026-10-24T01:00:00Z' });
const all = [race490, race490b, race350, egg, date];

describe('what each chip reads', () => {
  it('level: instant answer, Fast, Exact, Custom, Not recorded', () => {
    expect(levelOf({ level: 'light' })).toBe('instant');
    expect(levelOf({ atOnce: true })).toBe('instant');
    expect(levelOf({ level: 'quick' })).toBe('Fast');
    expect(levelOf({ effort: 'thorough' })).toBe('Exact');
    expect(levelOf({ level: 'exhaustive' })).toBe('Custom');
    expect(levelOf({ deadline: OTHER, mode: 'advanced', level: 'quick' })).toBe('Custom');
    expect(levelOf({})).toBe('unknown');
  });

  it('goal, ascensions, hours', () => {
    expect(factsOf(race490, ctx)).toMatchObject({ goal: 'fastest:490', asc: 3, hours: 'mine' });
    expect(factsOf(race350, ctx)).toMatchObject({ goal: 'fastest:other', asc: 2, hours: 'any' });
    expect(factsOf(egg, ctx).goal).toBe('eggday');
    expect(factsOf(date, ctx).goal).toBe('date');
  });

  it('sent: calendar days in the zone (today, 1–6 days, 1–4 weeks, older), none without a send time', () => {
    expect(whenOf(race490, NOW, 'UTC')).toBe('today');
    expect(whenOf(race490b, NOW, 'UTC')).toBe('week');
    expect(whenOf(race350, NOW, 'UTC')).toBe('month');
    expect(whenOf(egg, NOW, 'UTC')).toBe('older');
    // 1:00 am UTC on the 24th is still the 23rd in Chicago.
    expect(whenOf(date, NOW, 'America/Chicago')).toBe('week');
    expect(whenOf(row({ receivedAt: undefined }), NOW, 'UTC')).toBeNull();
  });
});

describe('chips only for values that occur', () => {
  it('every group with two values or more, in its order, with counts', () => {
    const g = chipGroups(all, sel(), ctx);
    expect(g.map(x => x.id)).toEqual(['goal', 'asc', 'level', 'hours', 'when']);
    expect(g[0].chips.map(c => `${c.label} ${c.count}`)).toEqual([
      'Fastest to 490 2',
      'Other targets 1',
      'Egg Day 2027 1',
      'Other dates 1',
    ]);
    expect(g[1].chips.map(c => c.label)).toEqual(['1', '2', '3']);
    expect(g[2].chips.map(c => c.label)).toEqual(['Instant answer', 'Fast', 'Exact', 'Custom']);
    expect(g[3].chips.map(c => c.label)).toEqual(['My hours', 'Any time']);
    expect(g[4].chips.map(c => c.label)).toEqual(['Today', '1–6 days ago', '1–4 weeks ago', 'Older']);
  });

  it('no group with a single value: four races to 490, Fast, any time, sent today', () => {
    const same = [0, 1, 2, 3].map(() => row({ level: 'quick' }));
    expect(chipGroups(same, sel(), ctx)).toEqual([]);
    const twoLengths = [...same, row({ chain: [490], level: 'quick' })];
    expect(chipGroups(twoLengths, sel(), ctx).map(x => x.id)).toEqual(['asc']);
  });

  it('a picked chip is on', () => {
    const g = chipGroups(all, sel({ level: ['Fast'] }), ctx);
    expect(g.find(x => x.id === 'level')?.chips.filter(c => c.on).map(c => c.value)).toEqual(['Fast']);
  });

  it('the planner’s own target leads the goals, whatever it is; every other race is "Other targets"', () => {
    const g = chipGroups(all, sel(), { ...ctx, mainTarget: 350 });
    expect(g[0].chips.map(c => `${c.label} ${c.count}`).slice(0, 2)).toEqual(['Fastest to 350 1', 'Other targets 2']);
  });
});

describe('filtering', () => {
  const kept = (s: Partial<RunsExplore>) => all.filter(r => inExplore(r, sel(s), ctx));

  it('each group alone', () => {
    expect(kept({ goal: ['fastest:490'] })).toEqual([race490, race490b]);
    expect(kept({ asc: [2] })).toEqual([race490b, race350]);
    expect(kept({ level: ['Custom'] })).toEqual([egg, date]);
    expect(kept({ level: ['instant'] })).toEqual([race350]);
    expect(kept({ hours: ['mine'] })).toEqual([race490]);
    expect(kept({ when: ['today'] })).toEqual([race490, date]);
    expect(kept({ stops: '230 310' })).toEqual([egg]);
  });

  it('or within a group, and across groups', () => {
    expect(kept({ goal: ['eggday', 'date'] })).toEqual([egg, date]);
    expect(kept({ goal: ['eggday', 'date'], when: ['today'] })).toEqual([date]);
    expect(kept({ goal: ['fastest:490'], level: ['Custom'] })).toEqual([]);
  });

  it('effective selection: picks without a chip dropped, nothing below 4 runs', () => {
    const s = sel({ asc: [7, 2], level: ['Fast'], sort: 'te' });
    expect(effectiveSelection(all, s, ctx)).toMatchObject({ asc: [2], level: ['Fast'], sort: 'te' });
    expect(MIN_RUNS_FOR_BAR).toBe(4);
    expect(effectiveSelection(all.slice(0, 3), s, ctx)).toEqual(emptyExplore());
  });

  it('toggle, count, Clear filters (the sort stays)', () => {
    let s = toggleChip(sel(), 'asc', '3');
    expect(s.asc).toEqual([3]);
    s = toggleChip(s, 'level', 'Fast');
    s = toggleChip(s, 'level', 'Exact');
    expect(activeCount({ ...s, stops: '200' })).toBe(4);
    s = toggleChip(s, 'level', 'Fast');
    expect(s.level).toEqual(['Exact']);
    expect(clearExplore({ ...s, sort: 'newest' })).toEqual(emptyExplore('newest'));
    expect(countWords(5, 25)).toBe('5 of 25 runs');
    expect(countWords(1, 1)).toBe('1 of 1 run');
  });
});

describe('sorting', () => {
  const ids = (s: Parameters<typeof sortExplore>[2]) => sortExplore(all, r => r, s, EGG_DAY).map(r => r.id);
  it('newest, most TE, fewest ascensions, fastest finish', () => {
    expect(ids('newest')[0]).toBe(race490.id);
    expect(ids('te').slice(0, 2).sort()).toEqual([race490.id, race490b.id].sort());
    expect(ids('te')[2]).toBe(race350.id);
    expect(ids('fewest')[0]).toBe(date.id);
    // The races finish in October; the By a date answer's last stop is in January, Egg Day's in July.
    expect(ids('finish').slice(-2)).toEqual([date.id, egg.id]);
    expect(ids('best')[0]).toBe(egg.id);
  });
});

describe('remembered per account', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('written and read back under the account hash, never the ID', () => {
    const s = sel({ goal: ['eggday'], asc: [3], sort: 'newest' });
    writeExplore('hashA', s);
    expect([...store.keys()]).toEqual([`${RUNS_EXPLORE_PREFIX}hashA`]);
    expect(readExplore('hashA')).toEqual(s);
    expect(readExplore('hashB')).toEqual(emptyExplore());
    expect(readExplore('')).toEqual(emptyExplore());
  });

  it('the default is stored as nothing; junk reads as the default', () => {
    writeExplore('hashA', sel({ level: ['Fast'] }));
    writeExplore('hashA', emptyExplore());
    expect(store.size).toBe(0);
    store.set(`${RUNS_EXPLORE_PREFIX}hashA`, '{not json');
    expect(readExplore('hashA')).toEqual(emptyExplore());
    expect(parseExplore({ level: ['Light', 'Fast'], asc: [-1, 2, 'x'], sort: 'odd' })).toEqual(
      sel({ level: ['Fast'], asc: [2] })
    );
  });

  it('a storage that throws changes nothing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => writeExplore('hashA', sel({ asc: [2] }))).not.toThrow();
    expect(readExplore('hashA')).toEqual(emptyExplore());
  });
});
