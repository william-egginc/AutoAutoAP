import { describe, expect, it } from 'vitest';
import {
  beats,
  bestOf,
  bracketBest,
  compareText,
  cutRoute,
  earlierRoutes,
  lowerLastStops,
  minutesText,
  nearbyChains,
  nearbyCount,
  newBracket,
  nextLast,
  refineEstimateText,
  refineFit,
  refineSeconds,
  sourceLabel,
  stepDownTargets,
  type Goal,
  type Priced,
  fastestFirst,
  priceEarlier,
  refine,
  stepDown,
  type PriceFn,
} from './strongerCheck';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { CheckEntry } from './checkHistory';
import type { RunSummary } from './runLibrary';
import type { SavedAnswer } from './deadlineStore';

const FAST: Goal = { kind: 'fastest', target: 490 };
const DEADLINE = 1_815_660_000;
const DATE: Goal = { kind: 'date', deadline: DEADLINE };
const p = (chain: number[], end: number, endTE = chain[chain.length - 1]): Priced => ({
  chain,
  end,
  endTE,
  seconds: end - 1_700_000_000,
});

describe('cutRoute', () => {
  it('drops stops already passed and keeps the target', () => {
    expect(cutRoute([150, 170, 200, 490], 165, FAST)).toEqual([170, 200, 490]);
  });
  it('a fastest route must end at the target', () => {
    expect(cutRoute([170, 200, 480], 160, FAST)).toBeNull();
  });
  it('by a date any last stop above the TE will do, never past 490 or out of order', () => {
    expect(cutRoute([170, 200, 247], 160, DATE)).toEqual([170, 200, 247]);
    expect(cutRoute([170, 160, 247], 150, DATE)).toBeNull();
    expect(cutRoute([170, 500], 150, DATE)).toBeNull();
    expect(cutRoute([150, 160], 165, DATE)).toBeNull();
    expect(cutRoute([], 150, DATE)).toBeNull();
    expect(cutRoute(undefined, 150, DATE)).toBeNull();
  });
});

describe('earlierRoutes', () => {
  // From /mine (sent from this browser): `yours`. Look-alikes from another browser: search/earlierBoard.spec.ts.
  const board = [
    { chain: [180, 230, 490], finalTE: 490, durationDays: 200, receivedAt: '2026-10-03T12:00:00Z', yours: true },
    { chain: [175, 225, 490], finalTE: 490, durationDays: 190, yours: true },
    { chain: [175, 225, 247], finalTE: 247, durationDays: 100, deadline: DEADLINE + 3600, yours: true },
    { chain: [175, 225, 246], finalTE: 246, durationDays: 100, deadline: DEADLINE - 30 * 86400, yours: true },
  ] as BoardRow[];
  const history = [
    {
      at: 3,
      te: 160,
      mode: 'fastest',
      target: 490,
      instant: { chain: [171, 231, 490], end: 1 },
      exact: { chain: [172, 232, 490], end: 1 },
      shared: false,
      sig: 'a',
    },
    {
      at: 2,
      te: 160,
      mode: 'date',
      deadline: DEADLINE,
      instant: { chain: [171, 231, 248], end: 1 },
      exact: null,
      shared: false,
      sig: 'b',
    },
  ] as CheckEntry[];
  const savedRuns = [{ finalTE: 490, bestChain: [160, 176, 226, 490], savedAt: 5 }] as RunSummary[];
  const savedAnswers = [
    { savedAt: 9, result: { deadline: DEADLINE, routes: [{ chain: [168, 220, 249] }] } },
  ] as unknown as SavedAnswer[];

  it('fastest: last search, board runs best first, saved searches, then checks; each once, cut to the TE', () => {
    const r = earlierRoutes({
      goal: FAST,
      currentTE: 165,
      lastSearch: { chain: [175, 225, 490], finalTE: 490 },
      board,
      savedRuns,
      savedAnswers,
      history,
    });
    expect(r.map(x => [x.source, x.chain.join(' ')])).toEqual([
      ['last-search', '175 225 490'],
      ['board', '180 230 490'],
      ['saved-search', '176 226 490'],
      ['check', '172 232 490'],
    ]);
    expect(r[1].at).toBe(Date.parse('2026-10-03T12:00:00Z'));
  });

  it('a last search for another target is not this goal', () => {
    const r = earlierRoutes({ goal: FAST, currentTE: 165, lastSearch: { chain: [200, 300], finalTE: 300 } });
    expect(r).toEqual([]);
  });

  it('by a date: the same date (within 12 hours) only, highest TE first', () => {
    const r = earlierRoutes({ goal: DATE, currentTE: 160, board, savedAnswers, history });
    expect(r.map(x => [x.source, x.chain.join(' ')])).toEqual([
      ['board', '175 225 247'],
      ['saved-answer', '168 220 249'],
      ['check', '171 231 248'],
    ]);
  });

  it('skips the routes the panel prices anyway, and stops at the cap', () => {
    const r = earlierRoutes({ goal: FAST, currentTE: 165, board, history, exclude: [[180, 230, 490]], max: 1 });
    expect(r.map(x => x.chain.join(' '))).toEqual(['175 225 490']);
  });

  it('labels say where each came from', () => {
    const show = (t: number) => `T${t}`;
    expect(sourceLabel({ chain: [], source: 'last-search' }, show)).toBe('your last search here');
    expect(sourceLabel({ chain: [], source: 'board', at: 7 }, show)).toBe('your board run, sent T7');
    expect(sourceLabel({ chain: [], source: 'check' }, show)).toBe('your earlier check');
  });
});

describe('nearbyCount / nearbyChains', () => {
  it('fastest: every route with each stop before the target moved up to 2 either way, nearest first', () => {
    const base = [170, 200, 490];
    expect(nearbyCount(base, 150, FAST)).toBe(24);
    const all = nearbyChains(base, 150, FAST, 1000);
    expect(all).toHaveLength(24);
    expect(all.every(c => c[2] === 490)).toBe(true);
    expect(all.some(c => c.join() === base.join())).toBe(false);
    const dist = (c: number[]) => Math.abs(c[0] - 170) + Math.abs(c[1] - 200);
    expect(all.map(dist)).toEqual([...all.map(dist)].sort((a, b) => a - b));
    expect(dist(all[0])).toBe(1);
    expect(new Set(all.map(c => c.join())).size).toBe(24);
  });

  it('keeps stops increasing and above the TE', () => {
    // 151 can only move up (150 is the TE); 153 and 152 would collide.
    const all = nearbyChains([151, 153, 490], 150, FAST, 1000);
    expect(all.every(c => c[0] > 150 && c[1] > c[0])).toBe(true);
    expect(all).toHaveLength(nearbyCount([151, 153, 490], 150, FAST));
  });

  it('stops at max, so a long route never builds millions', () => {
    const long = [160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 490];
    expect(nearbyCount(long, 150, FAST)).toBe(5 ** 10 - 1);
    const some = nearbyChains(long, 150, FAST, 50);
    expect(some).toHaveLength(50);
    expect(some.every(c => c.length === long.length)).toBe(true);
  });

  it('by a date: prefixes, the route own first', () => {
    const base = [170, 200, 247];
    expect(nearbyCount(base, 150, DATE)).toBe(25);
    const all = nearbyChains(base, 150, DATE, 1000);
    expect(all[0]).toEqual([170, 200]);
    expect(all).toHaveLength(25);
    expect(nearbyChains([247], 150, DATE, 10)).toEqual([[]]);
    expect(nearbyCount([490], 150, FAST)).toBe(0);
  });
});

describe('bracket (by a date, the last stop)', () => {
  it('steps up while the date is made, and settles on the highest that makes it', () => {
    const b = newBracket([170, 200], 247, 150);
    expect(nextLast(b)).toBe(247);
    b.tried[247] = true;
    expect(nextLast(b)).toBe(248);
    b.tried[248] = true;
    expect(nextLast(b)).toBe(249);
    b.tried[249] = false;
    expect(nextLast(b)).toBeNull();
    expect(bracketBest(b)).toBe(248);
  });

  it('steps down while it misses, never more than 2 below', () => {
    const b = newBracket([170, 200], 247, 150);
    b.tried[247] = false;
    expect(nextLast(b)).toBe(246);
    b.tried[246] = false;
    expect(nextLast(b)).toBe(245);
    b.tried[245] = false;
    expect(nextLast(b)).toBeNull();
    expect(bracketBest(b)).toBeNull();
  });

  it('never goes to or below its own prefix, nor past 490', () => {
    const b = newBracket([170, 246], 247, 150);
    expect(b.lo).toBe(247);
    b.tried[247] = false;
    expect(nextLast(b)).toBeNull();
    expect(newBracket([480], 489, 150).hi).toBe(490);
  });
});

describe('estimates', () => {
  it('scales with routes and workers; by a date about two routes a shape', () => {
    const one = refineSeconds(100, FAST, 4, 8);
    expect(refineSeconds(200, FAST, 4, 8)).toBeCloseTo(one * 2);
    expect(refineSeconds(100, DATE, 4, 8)).toBeCloseTo(one * 2);
    expect(refineSeconds(100, FAST, 4, 4)).toBeCloseTo(one * 2);
    expect(refineSeconds(100, FAST, 4, 8, 1)).toBeCloseTo(12.5);
  });

  it('fits what the budget holds, at least one', () => {
    expect(refineFit(1000, FAST, 4, 8, 1, 60)).toBe(480);
    expect(refineFit(10, FAST, 4, 8, 1, 60)).toBe(10);
    expect(refineFit(10, FAST, 4, 1, 1000, 60)).toBe(1);
    expect(refineFit(0, FAST, 4, 8)).toBe(0);
  });

  it('says what it will do', () => {
    expect(minutesText(30)).toBe('under a minute');
    expect(minutesText(240)).toBe('about 4 min');
    expect(minutesText(7200)).toBe('about 2.0 h');
    expect(refineEstimateText({ goal: FAST, total: 24, fit: 24, seconds: 120, workers: 8 })).toBe(
      'Checks all 24 routes within 2 TE of each stop (every TE): about 2 min on 8 workers.'
    );
    const capped = refineEstimateText({ goal: DATE, total: 3125, fit: 400, seconds: 470, workers: 1 });
    expect(capped).toContain('3,125 route shapes');
    expect(capped).toContain('the last stop bracketed to the date');
    expect(capped).toContain('the nearest 400 fit in about 8 min on 1 worker.');
    expect(capped).toContain('It stops after 10 min either way.');
  });
});

describe('ranking', () => {
  it('fastest: sooner by more than a minute', () => {
    expect(beats(FAST, p([490], 100_000), p([490], 100_100))).toBe(true);
    expect(beats(FAST, p([490], 100_000), p([490], 100_030))).toBe(false);
    expect(beats(FAST, p([490], 100_000), null)).toBe(true);
    expect(compareText(FAST, p([490], 100_000), p([490], 100_000 + 86400 * 0.5))).toBe('0.50 days sooner');
    expect(compareText(FAST, p([490], 100_000 + 86400), p([490], 100_000))).toBe('1.00 days later');
  });

  it('by a date: making it first, then TE, then spare', () => {
    const made247 = p([200, 247], DEADLINE - 86400);
    const made248 = p([200, 248], DEADLINE - 3600);
    const late249 = p([200, 249], DEADLINE + 3600);
    expect(beats(DATE, made248, made247)).toBe(true);
    expect(beats(DATE, late249, made248)).toBe(false);
    expect(beats(DATE, made247, late249)).toBe(true);
    expect(beats(DATE, p([201, 247], DEADLINE - 2 * 86400), made247)).toBe(true);
    expect(bestOf(DATE, [late249, made247, made248, null])).toBe(made248);
    expect(compareText(DATE, made248, made247)).toBe('1 TE higher');
    expect(compareText(DATE, p([201, 247], DEADLINE - 2 * 86400), made247)).toBe('1.00 days more to spare');
    expect(compareText(DATE, late249, made247)).toBe('misses the date by 0.04 days');
  });
});

describe('step-down', () => {
  it('one and two TE below the top route, above the TE', () => {
    expect(stepDownTargets(248, 160)).toEqual([247, 246]);
    expect(stepDownTargets(162, 160)).toEqual([161]);
    expect(stepDownTargets(161, 160)).toEqual([]);
  });
  it('an earlier route that misses: its last stop lowered, above its prefix', () => {
    expect(lowerLastStops([200, 248], 160)).toEqual([
      [200, 247],
      [200, 246],
    ]);
    expect(lowerLastStops([200, 202], 160)).toEqual([[200, 201]]);
  });
});

// A made-up simulator: a route's end grows with its last stop, and is best with stops at 172 and 203.

const START = 1_800_000_000;
function fake(): { price: PriceFn; calls: number[][][] } {
  const calls: number[][][] = [];
  const price: PriceFn = async chains => {
    calls.push(chains);
    const out = new Map<string, Priced | null>();
    for (const c of chains) {
      if (c.includes(999)) {
        out.set(c.join(','), null);
        continue;
      }
      const last = c[c.length - 1];
      const shape = Math.abs((c[0] ?? 172) - 172) + (c.length > 2 ? Math.abs(c[1] - 203) : 0);
      const end = START + last * 50_000 + shape * 20_000;
      out.set(c.join(','), { chain: c, end, endTE: last, seconds: end - START });
    }
    return out;
  };
  return { price, calls };
}
const fakeEnd = (c: number[]) =>
  START + c[c.length - 1] * 50_000 + (Math.abs(c[0] - 172) + (c.length > 2 ? Math.abs(c[1] - 203) : 0)) * 20_000;
const priced = (c: number[]): Priced => ({
  chain: c,
  end: fakeEnd(c),
  endTE: c[c.length - 1],
  seconds: fakeEnd(c) - START,
});

describe('refine', () => {
  it('fastest: finds the better route within 2 TE of each stop and reports progress', async () => {
    const base = priced([170, 201, 490]);
    const items = nearbyChains(base.chain, 150, FAST, 1000);
    const { price } = fake();
    const seen: number[] = [];
    const out = await refine({
      goal: FAST,
      base,
      currentTE: 150,
      items,
      batch: 5,
      price,
      shouldStop: () => false,
      onProgress: p => seen.push(p.done),
    });
    expect(out.best.chain).toEqual([172, 203, 490]);
    expect(out.improved).toBe(true);
    expect(out.stopped).toBe(false);
    expect(out.priced).toBe(24);
    expect(seen[seen.length - 1]).toBe(24);
  });

  it('nothing better: keeps the route it started with', async () => {
    const base = priced([172, 203, 490]);
    const out = await refine({
      goal: FAST,
      base,
      currentTE: 150,
      items: nearbyChains(base.chain, 150, FAST, 1000),
      batch: 8,
      price: fake().price,
      shouldStop: () => false,
    });
    expect(out.best).toBe(base);
    expect(out.improved).toBe(false);
  });

  it('stops when asked, with the best so far', async () => {
    const base = priced([170, 201, 490]);
    let n = 0;
    const out = await refine({
      goal: FAST,
      base,
      currentTE: 150,
      items: nearbyChains(base.chain, 150, FAST, 1000),
      batch: 4,
      price: fake().price,
      shouldStop: () => ++n > 2,
    });
    expect(out.stopped).toBe(true);
    expect(out.done).toBe(8);
  });

  it('by a date: brackets each shape last stop to the highest that makes the date', async () => {
    // The date allows last stop 247 on the best shape (172, 203) and 246 with one TE off.
    const deadline = START + 247 * 50_000 + 10_000;
    const goal: Goal = { kind: 'date', deadline };
    const base = priced([171, 203, 246]);
    expect(base.end <= deadline).toBe(true);
    const { price, calls } = fake();
    const out = await refine({
      goal,
      base,
      currentTE: 150,
      items: nearbyChains(base.chain, 150, goal, 1000),
      batch: 25,
      price,
      shouldStop: () => false,
    });
    expect(out.best.chain).toEqual([172, 203, 247]);
    expect(out.best.end <= deadline).toBe(true);
    // Every round is same-shape tries, never more than three tries a shape.
    const tries = calls.flat();
    for (const prefix of nearbyChains(base.chain, 150, goal, 1000)) {
      const mine = tries.filter(c => c.slice(0, -1).join() === prefix.join());
      expect(mine.length).toBeLessThanOrEqual(3);
    }
    // The route itself was not priced again.
    expect(tries.some(c => c.join() === base.chain.join())).toBe(false);
  });
});

describe('priceEarlier', () => {
  it('fastest: each route priced; a failure is null', async () => {
    const out = await priceEarlier({
      goal: FAST,
      currentTE: 150,
      routes: [
        { chain: [172, 203, 490], source: 'board' },
        { chain: [999, 490], source: 'check' },
      ],
      price: fake().price,
    });
    expect(out[0].made?.chain).toEqual([172, 203, 490]);
    expect(out[1].priced).toBeNull();
  });

  it('by a date: one that misses has its last stop lowered until it makes it', async () => {
    const deadline = START + 247 * 50_000 + 10_000;
    const out = await priceEarlier({
      goal: { kind: 'date', deadline },
      currentTE: 150,
      routes: [{ chain: [172, 203, 249], source: 'last-search' }],
      price: fake().price,
    });
    expect(out[0].priced?.chain).toEqual([172, 203, 249]);
    expect(out[0].made?.chain).toEqual([172, 203, 247]);
  });
});

describe('stepDown', () => {
  it('one TE lower first; on to two lower only when that misses', async () => {
    const deadline = START + 246 * 50_000 + 10_000;
    const asked: number[] = [];
    const steps = await stepDown({
      deadline,
      topTE: 248,
      currentTE: 150,
      find: async t => {
        asked.push(t);
        return [[172, 203, t]];
      },
      price: fake().price,
    });
    expect(asked).toEqual([247, 246]);
    expect(steps.map(s => [s.target, s.made?.chain.join(' ') ?? null])).toEqual([
      [247, null],
      [246, '172 203 246'],
    ]);
  });

  it('stops at the first TE that makes it', async () => {
    const steps = await stepDown({
      deadline: START + 247 * 50_000 + 10_000,
      topTE: 248,
      currentTE: 150,
      find: async t => [[172, 203, t]],
      price: fake().price,
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].made?.endTE).toBe(247);
  });

  it('fastestFirst: soonest first, one per count', () => {
    const r = (end: number, n: number) => ({
      chain: Array.from({ length: n }, (_, i) => i),
      legs: [],
      end,
      seconds: end,
    });
    expect(fastestFirst({ byAscensions: [null, r(5, 1), r(3, 2), r(9, 3)] }, 2).map(x => x.end)).toEqual([3, 5]);
  });
});
