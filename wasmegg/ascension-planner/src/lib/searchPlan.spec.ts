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

  it('Fastest: sooner (or the same minute) replaces; later keeps the instant answer only when both are simulated', () => {
    // An older snapshot's Check exactly price: simulated on the account like the result.
    const inst = { end: NOW + 475 * D, exact: true };
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 473.8 * D, deadline: null })).toBe('sooner');
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 475 * D + 30, deadline: null })).toBe('sooner');
    expect(searchTakeover(inst, { goal: 'fastest', end: NOW + 475 * D + 22 * 60, deadline: null })).toBe('later');
    // The instant answer's own estimate (every snapshot since 23 Oct 2026): the simulated result drives outright.
    const estimate = { end: NOW + 475 * D, exact: false };
    expect(searchTakeover(estimate, { goal: 'fastest', end: NOW + 473.8 * D, deadline: null })).toBe('sooner');
    expect(searchTakeover(estimate, { goal: 'fastest', end: NOW + 475 * D + 22 * 60, deadline: null })).toBe('simulated');
    expect(searchTakeover({ end: NOW + 475 * D }, { goal: 'fastest', end: NOW + 476 * D, deadline: null })).toBe('simulated');
    expect(takesOver('simulated')).toBe(true);
    expect(keepWords('simulated', 'Fast', { end: NOW + 476 * D }, estimate, 'date')).toBe('');
    expect(searchTakeover(null, { goal: 'fastest', end: NOW, deadline: null })).toBe('no-instant');
    expect(takesOver('later')).toBe(false);
    expect(takesOver('misses-date')).toBe(false);
    expect(keepWords('later', 'Exact', { end: inst.end + 22 * 60 }, inst, 'date')).toBe(
      'Your Exact run finishes 22m later than the instant answer, so Right now follows the instant answer.'
    );
    expect(replaceWords('sooner', { end: inst.end - 1.2 * D }, inst)).toBe(
      'Finishes 28h 48m sooner than the instant answer for the same goal:'
    );
  });

  // Math review 24 Oct 2026 (verified), finding 1: one account, hours 7 am to 11 pm Denver, Fastest to 490. The
  // instant answer estimated Sep 21 2028, 2:08 am; its own route simulates to Sep 27; a Fast run seeded with it reached
  // Sep 21, 8:22 am. The rule kept the estimate ("6.2 h later than the instant answer"): now the Fast result drives.
  it('the verified case: an instant estimate of Sep 21, 2:08 am against a Fast result of Sep 21, 8:22 am: the Fast result drives', () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const estimate = at('2028-09-21T08:08:00Z'); // Sep 21 2028, 2:08 am Denver (MDT)
    const fastEnd = at('2028-09-21T14:22:00Z'); // Sep 21 2028, 8:22 am Denver
    const reallySimulates = at('2028-09-27T08:08:00Z'); // the instant route at once: Sep 27, 2:08 am
    const instantSnap: SnapLike = {
      at: NOW * 1000,
      answerStart: NOW,
      result: { best: { chain: [196, 221, 241, 260, 287, 328, 359, 490], end: estimate, legs: [] }, byAscensions: [] },
    } as unknown as SnapLike;
    const found = fast({ chain: [196, 221, 245, 260, 287, 328, 331, 490], end: fastEnd, endTE: 490 });
    const d = drivingPlan({ ...instantSnap, search: found }, 'fastest', null);
    expect(d.instant?.exact).toBe(false);
    expect(d.instant?.end).toBe(estimate);
    expect(d.takeover).toBe('simulated');
    expect(d.plan).toBe(d.search);
    expect(d.plan?.chain).toEqual([196, 221, 245, 260, 287, 328, 331, 490]);
    expect(fastEnd).toBeLessThan(reallySimulates);
    expect(replaceWords(d.takeover!, d.search!, d.instant)).toBe(
      "Simulated on your account with your awake hours, time off and dates, so it replaces the instant answer's estimate for the same goal:"
    );
    // Nothing says "later than the instant answer".
    expect(keepWords(d.takeover!, 'Fast', d.search!, d.instant, 'date')).toBe('');
  });

  it('Egg Day time off (Fastest): the result carries the rebuild the estimate leaves out, and still drives', () => {
    const estimate = NOW + 300 * D;
    const instantSnap = {
      at: NOW * 1000,
      answerStart: NOW,
      result: { best: { chain: [197, 228, 255, 490], end: estimate, legs: [] }, byAscensions: [] },
    } as unknown as SnapLike;
    // Time off over Egg Day: the ascension ends when it starts and is rebuilt after (search/chain.ts), 3.4 days on.
    const withTimeOff = fast({ chain: [197, 228, 255, 490], end: estimate + 3.4 * D, endTE: 490 });
    const d = drivingPlan({ ...instantSnap, search: withTimeOff }, 'fastest', null);
    expect(d.takeover).toBe('simulated');
    expect(d.plan).toBe(d.search);
    expect(d.plan?.end).toBe(estimate + 3.4 * D);
    // "Go back to the instant answer" still works for it.
    expect(drivingPlan({ ...instantSnap, search: withTimeOff }, 'fastest', null, { back: withTimeOff.at }).plan?.exact).toBe(false);
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
    expect(gapWords(22 * 60)).toBe('22m');
    expect(gapWords(5 * H)).toBe('5h');
    expect(gapWords(1.5 * D)).toBe('36h');
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
  it('Fastest, Stop & keep best: no pointer while it is still stopping, then its best so far once it ends (23 Oct 2026)', () => {
    // Stopping: the store still says running until the workers finish the routes they have (search/stopNote.ts).
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, running: true } })).toBeNull();
    // Ended (stopped early): the best so far is the result, at its own level.
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, running: false, bestDays: 101.5 } })).toMatchObject({
      level: 'Fast',
      end: NOW + 101.5 * D,
      endTE: 490,
    });
    // Stopped before any route was priced: nothing to point at (not "Invalid Date").
    expect(liveSearchResult({ ...base, fastest: { ...base.fastest, bestDays: Infinity } })).toBeNull();
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

describe('results kept beyond the snapshot (aap-search-plans)', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const k = { account: 'acct', goal: 'date 1815753600', backupTime: NOW };
  it('one per account, goal and save; a newer result replaces, an older or the same is ignored; capped', async () => {
    const { recordKeptSearch, readKeptSearches, findKeptSearch, markKeptBack, forgetKeptSearch, MAX_KEPT_SEARCHES, KEPT_SEARCH_KEY } = await import('./searchPlan');
    const st = mem();
    expect(recordKeptSearch({ ...k, search: fast() }, st)).toBe(true);
    expect(recordKeptSearch({ ...k, backupTime: NOW + 300, search: fast() }, st)).toBe(false);
    expect(recordKeptSearch({ ...k, search: fast({ at: fast().at + 1, endTE: 313 }) }, st)).toBe(true);
    expect(readKeptSearches(st)).toHaveLength(1);
    expect(findKeptSearch(readKeptSearches(st), { ...k, backupTime: NOW + 120 })?.search.endTE).toBe(313);
    expect(findKeptSearch(readKeptSearches(st), { ...k, backupTime: NOW + 3600 })).toBeNull();
    markKeptBack(k, true, st);
    expect(readKeptSearches(st)[0].back).toBe(true);
    // The same result again doesn't clear going back; a newer one does.
    expect(recordKeptSearch({ ...k, search: fast({ at: fast().at + 1, endTE: 313 }) }, st)).toBe(false);
    expect(recordKeptSearch({ ...k, search: fast({ at: fast().at + 2 }) }, st)).toBe(true);
    expect(readKeptSearches(st)[0].back).toBeUndefined();
    forgetKeptSearch(k, st);
    expect(readKeptSearches(st)).toEqual([]);
    for (let i = 0; i < MAX_KEPT_SEARCHES + 3; i++) recordKeptSearch({ ...k, backupTime: NOW + i * 3600, search: fast({ at: i }) }, st);
    expect(readKeptSearches(st)).toHaveLength(MAX_KEPT_SEARCHES);
    expect(st.getItem(KEPT_SEARCH_KEY)).not.toMatch(/EI\d{16}/);
  });
});
