import { describe, expect, it } from 'vitest';
import type { LegSummary } from '@/search/types';
import {
  drivingPlan,
  gapWords,
  keepWords,
  liveSearchResult,
  newerSearch,
  readSearch,
  replaceWords,
  searchTakeover,
  sourcePill,
  takesOver,
  type LiveSearchInput,
  type SnapSearch,
} from './searchPlan';
import type { SnapLike } from './nowPlan';

const NOW = Date.UTC(2026, 9, 22, 18, 3) / 1000;
const H = 3600;
const D = 86400;
const DEADLINE = Date.UTC(2027, 6, 14, 17, 0) / 1000; // Egg Day 2027, 10:00 am Pacific

const leg = (start: number, end: number, endTE: number) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, startTime: start, tier13Unlocked: false, shifts: [] }) as unknown as LegSummary;

/** A snapshot with the instant answer's By a date route: 313 TE, last stop 1.46 days before the date. */
const snap = (o: Partial<SnapLike> = {}): SnapLike => ({
  at: NOW * 1000,
  answerStart: NOW,
  result: {
    best: null,
    byAscensions: [],
    byDate: {
      chain: [197, 228, 255, 278, 313],
      legs: [
        { to: 197, endTE: 197, start: NOW, end: NOW + 6 * D },
        { to: 313, endTE: 313, start: NOW + 6 * D, end: DEADLINE - 1.46 * D },
      ],
      end: DEADLINE - 1.46 * D,
    },
    byDateByAscensions: [],
  },
  ...o,
});

const fast = (o: Partial<SnapSearch> = {}): SnapSearch => ({
  level: 'Fast',
  chain: [197, 227, 257, 285, 312],
  end: DEADLINE - 1.74 * D,
  endTE: 312,
  legs: [leg(NOW, NOW + 6 * D, 197), leg(NOW + 6 * D, DEADLINE - 1.74 * D, 312)],
  at: (NOW + 5 * H) * 1000,
  planStart: NOW,
  ...o,
});

describe('which plan drives Right now (lib/searchPlan.ts)', () => {
  it('the instant answer, until a search result exists', () => {
    const d = drivingPlan(snap(), 'date', DEADLINE);
    expect(d.plan?.exact).toBe(false);
    expect(d.plan?.from).toBeUndefined();
    expect(d.plan?.endTE).toBe(313);
    expect(d.takeover).toBeNull();
  });

  it('a Fast result that makes the date replaces it, even with 1 TE less (Jordan, 23 Oct 2026)', () => {
    const d = drivingPlan(snap({ search: fast() }), 'date', DEADLINE);
    expect(d.takeover).toBe('makes-date');
    expect(d.plan).toBe(d.search);
    expect(d.plan?.from).toEqual({ level: 'Fast', at: (NOW + 5 * H) * 1000 });
    expect(d.plan?.endTE).toBe(312);
    expect(d.plan?.exact).toBe(true);
    expect(d.plan?.spareHours).toBeCloseTo(1.74 * 24, 5);
    expect(d.plan?.legs).toHaveLength(2);
    expect(d.instant?.endTE).toBe(313);
  });

  it('one that lands after the date keeps the instant answer, with a one-line note', () => {
    const late = fast({ end: DEADLINE + 2 * H });
    const d = drivingPlan(snap({ search: late }), 'date', DEADLINE);
    expect(d.takeover).toBe('misses-date');
    expect(d.plan).toBe(d.instant);
    expect(keepWords(d.takeover!, 'Fast', d.search!, d.instant, 'eggday')).toBe(
      'Your Fast run lands after Egg Day starts, so Right now follows the instant answer.'
    );
  });

  it('Fastest: sooner (or the same minute) replaces; later keeps the instant answer', () => {
    const inst = { end: NOW + 475 * D };
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 473.8 * D, deadline: null })).toBe('sooner');
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 475 * D + 30, deadline: null })).toBe('sooner');
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 475 * D + 22 * 60, deadline: null })).toBe('later');
    expect(searchTakeover(null, { goal: 'fastest', end: NOW, deadline: null })).toBe('no-instant');
    expect(takesOver('later')).toBe(false);
    expect(takesOver('misses-date')).toBe(false);
    expect(keepWords('later', 'Exact', { end: inst.end + 22 * 60 }, inst, 'date')).toBe(
      'Your Exact run finishes 22 min later than the instant answer, so Right now follows the instant answer.'
    );
    expect(replaceWords('sooner', { end: inst.end - 1.2 * D }, inst)).toBe(
      'Finishes 1.2 days sooner than the instant answer for the same goal:'
    );
  });

  it('"Go back to the instant answer" holds for that result only; a newer one takes over again', () => {
    const f = fast();
    const back = drivingPlan(snap({ search: f }), 'date', DEADLINE, { back: f.at });
    expect(back.wentBack).toBe(true);
    expect(back.plan).toBe(back.instant);
    const newer = drivingPlan(snap({ search: f }), 'date', DEADLINE, { back: f.at, live: fast({ at: f.at + 60_000 }) });
    expect(newer.wentBack).toBe(false);
    expect(newer.plan?.from?.at).toBe(f.at + 60_000);
  });

  it('a live result newer than the kept one wins; nothing kept but a live result still drives', () => {
    expect(newerSearch(fast({ at: 1 }), fast({ at: 2 }))?.at).toBe(2);
    const alone = drivingPlan(null, 'date', DEADLINE, { live: fast() });
    expect(alone.takeover).toBe('no-instant');
    expect(alone.plan?.from?.level).toBe('Fast');
  });

  it('a kept result that cannot be read back is ignored', () => {
    expect(readSearch(null)).toBeNull();
    expect(readSearch({ level: 'Light', chain: [1], end: 1, endTE: 1, at: 1 })).toBeNull();
    expect(readSearch({ level: 'Exact', chain: [], end: 1, endTE: 1, at: 1 })).toBeNull();
    expect(readSearch({ level: 'Custom', chain: [200], end: 5, endTE: 200, at: 9 })?.legs).toEqual([]);
  });

  it('the words: the pill, the replace line, gaps', () => {
    expect(sourcePill(null)).toBe('from the instant answer');
    expect(sourcePill('Fast')).toBe('from your Fast run, on your account');
    expect(replaceWords('makes-date', { end: 0 }, { end: 0 })).toBe(
      'Makes the date on your account, so it replaces the instant answer for the same goal:'
    );
    expect(gapWords(22 * 60)).toBe('22 min');
    expect(gapWords(5 * H)).toBe('5 h');
    expect(gapWords(1.5 * D)).toBe('1.5 days');
  });
});

describe('liveSearchResult: the store result for this goal and save (the instant card pointer reads the same)', () => {
  const base: LiveSearchInput = {
    goal: 'fastest',
    deadline: null,
    target: 490,
    currentTE: 186.4,
    ownerOk: o => o === '' || o === 'me',
    fastest: {
      running: false,
      bestDays: 475,
      bestChain: [197, 246, 298, 352, 418, 490],
      bestLegs: [],
      planStart: NOW,
      custom: false,
      effort: 'quick',
      at: 5,
      owner: 'me',
    },
    date: { running: false, result: null, owner: '' },
  };
  it('Fastest: a finished run to the target from above the save TE, on this account', () => {
    expect(liveSearchResult(base)).toMatchObject({ level: 'Fast', end: NOW + 475 * D, endTE: 490, at: 5 });
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, effort: 'normal' } })?.level).toBe('Exact');
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, custom: true } })?.level).toBe('Custom');
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, running: true } })).toBeNull();
    expect(liveSearchResult({ ...base, target: 500 })).toBeNull();
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, owner: 'other' } })).toBeNull();
  });
  it('By a date: the result for this deadline, started from the TE the save has now', () => {
    const date: LiveSearchInput = {
      ...base,
      goal: 'date',
      deadline: DEADLINE,
      date: {
        running: false,
        owner: '',
        result: { deadline: DEADLINE, te: 186, simple: true, level: 'quick', at: 7, planStart: NOW, routes: [{ chain: [197, 312], reachAt: DEADLINE - D }] },
      },
    };
    expect(liveSearchResult(date)).toMatchObject({ level: 'Fast', chain: [197, 312], endTE: 312, end: DEADLINE - D, at: 7 });
    expect(liveSearchResult({ ...date, deadline: DEADLINE + 1 })).toBeNull();
    expect(liveSearchResult({ ...date, currentTE: 190 })).toBeNull();
    expect(liveSearchResult({ ...date, date: { ...date.date, result: { ...date.date.result!, simple: false } } })?.level).toBe('Custom');
  });
});
