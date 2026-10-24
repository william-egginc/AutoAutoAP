/** Light at once (lightAtOnce.ts; Jordan, 14 Oct 2026): order, words, and the loop. */
import { describe, expect, it } from 'vitest';
import {
  atOnceQueue,
  doneWhat,
  earlierText,
  lookingText,
  rowAtOnce,
  rowLine,
  runAtOnce,
  signedGap,
  summaryLine,
  type AtOnceItem,
} from './lightAtOnce';
import type { Priced } from './strongerCheck';

const DAY = 86400;
const show = (u: number) => `T${u}`;
const p = (chain: number[], end: number, endTE = chain[chain.length - 1]): Priced => ({ chain, seconds: end, end, endTE });

describe('atOnceQueue', () => {
  const rows: AtOnceItem[] = [
    { chain: [300, 490], count: 2 },
    { chain: [250, 350, 490], count: 3 },
    { chain: [200, 300, 400, 490], count: 4 },
  ];
  it('the lead first, then the table order, each route once', () => {
    expect(atOnceQueue(rows, [250, 350, 490]).map(r => r.count)).toEqual([3, 2, 4]);
  });
  it('no lead: the table order', () => {
    expect(atOnceQueue(rows, null).map(r => r.count)).toEqual([2, 3, 4]);
  });
  it('a lead not in the table is priced too, first', () => {
    const q = atOnceQueue(rows, [260, 490]);
    expect(q[0]).toEqual({ chain: [260, 490], count: 2 });
    expect(q).toHaveLength(4);
  });
});

describe('words', () => {
  it('status steps', () => {
    expect(lookingText(1, 0, 5)).toBe('Looking at 1 ascension (1 of 5)');
    expect(lookingText(7, 1, 5)).toBe('Looking at 7 ascensions (2 of 5)');
    expect(earlierText(3, 6)).toBe('Your earlier routes: 3 of 6');
  });
  it('the gap against on the hour, the table\'s days', () => {
    expect(signedGap(100, 100 + 0.4 * DAY)).toBe('−0.40 days');
    expect(signedGap(100 + 0.1 * DAY, 100)).toBe('+0.10 days');
    expect(signedGap(100, 130)).toBe('same time');
  });
  it('a row line: Fastest, with and without hours', () => {
    const goal = { kind: 'fastest' as const, target: 490 };
    expect(rowLine({ goal, priced: p([300, 490], 1000), hourEnd: 1000 + 0.4 * DAY, hours: true, show })).toBe(
      'at once, on your hours: T1000 (−0.40 days)'
    );
    expect(rowLine({ goal, priced: p([300, 490], 1000), hourEnd: null, hours: false, show })).toBe('at once: T1000');
    expect(rowLine({ goal, priced: null, hourEnd: 5, hours: true, show })).toBe("at once, on your hours: couldn't price");
  });
  it('a row line by a date says the spare, or by how much it misses', () => {
    const goal = { kind: 'date' as const, deadline: 10 * DAY };
    expect(rowLine({ goal, priced: p([300, 310], 8 * DAY), hourEnd: 8.5 * DAY, hours: true, show })).toBe(
      `at once, on your hours: T${8 * DAY} (−0.50 days, 2.00 days to spare)`
    );
    expect(rowLine({ goal, priced: p([300, 310], 10.25 * DAY), hourEnd: 10.5 * DAY, hours: false, show })).toBe(
      `at once: T${10.25 * DAY} (−0.25 days, misses the date by 0.25 days)`
    );
  });
  it('Fastest summary: the soonest at once, against Check exactly on the hour', () => {
    const goal = { kind: 'fastest' as const, target: 490 };
    const best = p([250, 350, 490], 5 * DAY);
    expect(
      summaryLine({ goal, prices: [p([300, 490], 4.8 * DAY), null, p([250, 350, 490], 4.6 * DAY)], best, show })
    ).toBe(`Fastest as you'd play it: 250 → 350 → 490 reaches 490 on T${4.6 * DAY} (0.40 days sooner than on the hour)`);
    expect(summaryLine({ goal, prices: [p([300, 490], 5 * DAY + 10)], best, show })).toContain('(the same as on the hour)');
    expect(summaryLine({ goal, prices: [null], best, show })).toBe('');
  });
  it('By a date summary: the highest TE that makes it, then the spare', () => {
    const goal = { kind: 'date' as const, deadline: 10 * DAY };
    const best = p([300, 310], 9 * DAY);
    expect(summaryLine({ goal, prices: [p([300, 310], 8.6 * DAY)], best, show })).toBe(
      `As you'd play it: 300 → 310 reaches 310 TE on T${8.6 * DAY}, 1.40 days to spare (0.40 days more to spare than on the hour)`
    );
    expect(summaryLine({ goal, prices: [p([300, 312], 9.9 * DAY)], best, show })).toContain('(2 TE more than on the hour)');
    expect(summaryLine({ goal, prices: [p([300, 312], 11 * DAY)], best, show })).toBe(
      "As you'd play it: none of these routes makes the date at once either."
    );
  });
  it('the Done line', () => {
    expect(doneWhat({ instantPriced: 5, instantTotal: 5, earlierPriced: 2, earlierTotal: 3 })).toBe(
      "the instant answer's 5 routes at once, and 2 of your 3 earlier routes"
    );
    expect(doneWhat({ instantPriced: 4, instantTotal: 5, earlierPriced: 0, earlierTotal: 0 })).toBe(
      "4 of the instant answer's 5 routes at once"
    );
    expect(doneWhat({ instantPriced: 0, instantTotal: 0, earlierPriced: 0, earlierTotal: 0 })).toBe('');
  });
});

describe('runAtOnce', () => {
  const items: AtOnceItem[] = [
    { chain: [250, 350, 490], count: 3 },
    { chain: [300, 490], count: 2 },
    { chain: [200, 300, 400, 490], count: 4 },
  ];
  it('the lead alone first, then the rest; each result and step as it lands; unanswered = null', async () => {
    const calls: number[][][] = [];
    const got: [string, Priced | null][] = [];
    const steps: string[] = [];
    let paused = 0;
    const ok = await runAtOnce({
      items,
      price: async (chains, onEach) => {
        calls.push(chains);
        // The 4-ascension route never answers.
        for (const c of chains) if (c.length !== 4) onEach(c, p(c, c.length * 100));
      },
      onResult: (c, r) => got.push([c.join(','), r]),
      onProgress: (next, i, n) => steps.push(next ? lookingText(next.count, i, n) : 'done'),
      shouldStop: () => false,
      pause: async () => {
        paused++;
      },
    });
    expect(ok).toBe(true);
    expect(calls.map(c => c.length)).toEqual([1, 2]);
    expect(calls[0][0]).toEqual([250, 350, 490]);
    expect(paused).toBe(1);
    expect(got.map(g => g[0])).toEqual(['250,350,490', '300,490', '200,300,400,490']);
    expect(got[2][1]).toBeNull();
    expect(steps[0]).toBe('Looking at 3 ascensions (1 of 3)');
    expect(steps[1]).toBe('Looking at 2 ascensions (2 of 3)');
    expect(steps[steps.length - 1]).toBe('done');
  });
  it('stops after the lead when asked, and records nothing more', async () => {
    let stop = false;
    const got: string[] = [];
    const ok = await runAtOnce({
      items,
      price: async (chains, onEach) => {
        for (const c of chains) onEach(c, p(c, 1));
        stop = true;
      },
      onResult: c => got.push(c.join(',')),
      onProgress: () => {},
      shouldStop: () => stop,
    });
    expect(ok).toBe(false);
    expect(got).toEqual(['250,350,490']);
  });
  it('nothing to price is done at once', async () => {
    expect(
      await runAtOnce({
        items: [],
        price: async () => {
          throw new Error('not called');
        },
        onResult: () => {},
        onProgress: () => {},
        shouldStop: () => false,
      })
    ).toBe(true);
  });
});

// HOURS FIX B (hoursRunnerUp.ts): with the player's hours on, each row's other route goes to Light too.
describe('Light at once with hours on: each row\'s next-best route (the alt case, Egg Day)', () => {
  const PICK = [161, 198, 224, 248];
  const SECOND = [161, 198, 218, 248];
  const rows: AtOnceItem[] = [
    { chain: [170, 220, 248], count: 3 },
    { chain: PICK, count: 4, alt: SECOND },
  ];
  it('the queue adds each alt after the rows, flagged, each route once', () => {
    const q = atOnceQueue(rows, PICK);
    expect(q.map(it => [it.chain.join(' '), !!it.extra])).toEqual([
      ['161 198 224 248', false],
      ['170 220 248', false],
      ['161 198 218 248', true],
    ]);
  });
  it('hours off (no alt): the queue is the rows alone', () => {
    expect(atOnceQueue([rows[0], { chain: PICK, count: 4 }], PICK)).toHaveLength(2);
  });
  it('the status counts the extra routes honestly', async () => {
    const steps: string[] = [];
    const calls: number[][][] = [];
    const items = atOnceQueue(rows, PICK);
    await runAtOnce({
      items,
      price: async (chains, onEach) => {
        calls.push(chains);
        for (const c of chains) onEach(c, p(c, 100));
      },
      onResult: () => {},
      onProgress: (next, i, n) => steps.push(next ? lookingText(next.count, i, n, !!next.extra) : 'done'),
      shouldStop: () => false,
    });
    // Every route priced: the pick, the other row, and the pick's next best.
    expect(calls.flat().map(c => c.join(' '))).toEqual(['161 198 224 248', '170 220 248', '161 198 218 248']);
    expect(steps[0]).toBe('Looking at 4 ascensions (1 of 3)');
    expect(steps).toContain('Looking at 4 ascensions, next-best route (3 of 3)');
  });
  it('a row shows the better at once of its two routes (By a date: more to spare), naming the alt', () => {
    const goal = { kind: 'date' as const, deadline: 10 * DAY };
    const have = { [PICK.join(',')]: p(PICK, 9 * DAY, 248), [SECOND.join(',')]: p(SECOND, 8 * DAY, 248) };
    expect(rowAtOnce(goal, have, PICK, SECOND)).toEqual({ chain: SECOND, priced: have[SECOND.join(',')], extra: true });
    // The pick better: it stays.
    const pickBetter = { [PICK.join(',')]: p(PICK, 7 * DAY, 248), [SECOND.join(',')]: p(SECOND, 8 * DAY, 248) };
    expect(rowAtOnce(goal, pickBetter, PICK, SECOND)!.extra).toBe(false);
    // Hours off (no alt), or nothing priced yet.
    expect(rowAtOnce(goal, have, PICK)!.chain).toEqual(PICK);
    expect(rowAtOnce(goal, {}, PICK, SECOND)).toBeNull();
  });
});
