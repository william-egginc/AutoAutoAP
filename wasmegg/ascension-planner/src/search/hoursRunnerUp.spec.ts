/**
 * HOURS FIX B (hoursRunnerUp.ts; the Tables chat, 16 Oct 2026): with the player's hours on, Check exactly also
 * prices each count's next-best route and the better leads the row. The fixture is the alt case (Oct 10 save,
 * Egg Day, hours 7 am to 11 pm): the table's 4-ascension pick 161 198 224 248 is 10.4 h to spare exactly; the
 * route it ranked second, 161 198 218 248, is 16.8 h. A fake pool stands in for the simulator.
 */
import { describe, expect, it } from 'vitest';
import {
  exactWinner,
  nextBest,
  priceWithRunnerUps,
  routesToPrice,
  secondNote,
  withPicks,
  withWinners,
  type ExactEnd,
} from './hoursRunnerUp';
import type { FoundRoutes, Route } from './routeFinder';
import { isConstrained } from './availability';

const H = 3600;
const START = 1_760_000_000;
/** Egg Day's deadline in the fixture: 12 days after the plan start. */
const DEADLINE = START + 12 * 86400;

/** A table route ending at `end` (the table's estimate), its legs evenly spread. */
function route(chain: number[], end: number): Route {
  const step = (end - START) / chain.length;
  return {
    chain,
    end,
    seconds: end - START,
    legs: chain.map((to, i) => ({
      from: i ? chain[i - 1] : 140,
      to,
      endTE: to,
      start: START + i * step,
      end: START + (i + 1) * step,
      sales: 2,
      tier13: false,
      label: '2-sale',
    })),
  };
}

const PICK = [161, 198, 224, 248];
const SECOND = [161, 198, 218, 248];
const THIRD = [162, 199, 224, 248];

/** The finder's answer for count 4 (By a date and Fastest alike): the table ranks PICK first, SECOND next. */
function fixture(): FoundRoutes {
  const pick = route(PICK, DEADLINE - 20 * H);
  const second = route(SECOND, DEADLINE - 19 * H);
  const third = route(THIRD, DEADLINE - 18 * H);
  const three = route([170, 220, 248], DEADLINE - 15 * H);
  return {
    best: pick,
    byAscensions: [null, null, null, three, pick],
    byDate: pick,
    byDateByAscensions: [null, null, null, three, pick],
    alternatives: [[], [], [], [], [second, third]],
    dateAlternatives: [[], [], [], [], [second, third]],
  };
}

/** The simulator on the player's hours, as a fake pool: seconds from the plan start per route, every call
 *  counted. The alt case's exact prices: PICK 10.4 h to spare, SECOND 16.8 h. */
function fakePool(spareHours: Record<string, number>) {
  const calls: number[][][] = [];
  const exact: Record<string, ExactEnd | null> = {};
  return {
    calls,
    exact,
    /** The component's `price`: the pool's evaluate, then the Exact map filled. */
    price: async (chains: number[][]) => {
      calls.push(chains.map(c => [...c]));
      for (const c of chains) {
        const spare = spareHours[c.join(',')];
        exact[c.join(',')] = spare === undefined ? null : { end: DEADLINE - spare * H, endTE: c[c.length - 1] };
      }
      return true;
    },
    exactOf: (c: number[]) => exact[c.join(',')],
  };
}

const ALT_CASE = { [PICK.join(',')]: 10.4, [SECOND.join(',')]: 16.8, [THIRD.join(',')]: 2 };
const ON = isConstrained({ days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 23, timezone: 'America/New_York' });

describe('the alt case (Egg Day, 7 am to 11 pm): the route the table ranked second leads with hours on', () => {
  it('(a) hours on: both routes are priced in one call and 161 198 218 248 leads the row', async () => {
    expect(ON).toBe(true);
    const found = fixture();
    const pool = fakePool(ALT_CASE);
    const got = await priceWithRunnerUps({
      goal: { kind: 'date', deadline: DEADLINE },
      rows: [found.byDateByAscensions[4]!],
      alternatives: found.dateAlternatives,
      hoursOn: ON,
      price: pool.price,
      exactOf: pool.exactOf,
    });
    expect(got.ok).toBe(true);
    expect(pool.calls).toEqual([[PICK, SECOND]]);
    expect(got.wins[4].winner.chain).toEqual(SECOND);
    expect(got.wins[4].why).toBe('spare');
    // The exact prices behind it: 16.8 h against 10.4 h to spare.
    expect((DEADLINE - pool.exact[SECOND.join(',')]!.end) / H).toBeCloseTo(16.8, 6);
    expect((DEADLINE - pool.exact[PICK.join(',')]!.end) / H).toBeCloseTo(10.4, 6);
  });

  it('(a) Fastest: the same fixture, the runner-up 6.4 h sooner, leads the row in the answer', async () => {
    const found = fixture();
    const pool = fakePool(ALT_CASE);
    const got = await priceWithRunnerUps({
      goal: { kind: 'fastest' },
      rows: [found.byAscensions[3]!, found.byAscensions[4]!],
      alternatives: found.alternatives,
      hoursOn: true,
      price: pool.price,
      exactOf: pool.exactOf,
    });
    // One call: count 3 (no alternative) and count 4 with its next best.
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]).toEqual([[170, 220, 248], PICK, SECOND]);
    expect(Object.keys(got.wins)).toEqual(['4']);
    expect(got.wins[4].why).toBe('sooner');
    // The row (and everything reading byAscensions) sees the winner; the table's own pick stays `best`.
    const shown = withWinners(found, got.wins);
    expect(shown.byAscensions[4]!.chain).toEqual(SECOND);
    expect(shown.byAscensions[3]).toBe(found.byAscensions[3]);
    expect(shown.best!.chain).toEqual(PICK);
    // A check run again starts from the table's pick.
    expect(withPicks(shown, got.wins).byAscensions[4]!.chain).toEqual(PICK);
  });

  it('(b) hours off: only the pick is priced (the pool is called once, with one route per count)', async () => {
    const found = fixture();
    const pool = fakePool(ALT_CASE);
    const got = await priceWithRunnerUps({
      goal: { kind: 'date', deadline: DEADLINE },
      rows: [found.byDateByAscensions[3]!, found.byDateByAscensions[4]!],
      alternatives: found.dateAlternatives,
      hoursOn: isConstrained(null),
      price: pool.price,
      exactOf: pool.exactOf,
    });
    expect(pool.calls).toEqual([[[170, 220, 248], PICK]]);
    expect(got.wins).toEqual({});
    expect(got.alts).toEqual({});
    expect(withWinners(found, got.wins)).toBe(found);
  });

  it('(c) the pick stays when it is better (or tied)', async () => {
    const found = fixture();
    for (const spare of [{ [PICK.join(',')]: 16.8, [SECOND.join(',')]: 10.4 }, { [PICK.join(',')]: 12, [SECOND.join(',')]: 12 }]) {
      const pool = fakePool(spare);
      const got = await priceWithRunnerUps({
        goal: { kind: 'date', deadline: DEADLINE },
        rows: [found.byDateByAscensions[4]!],
        alternatives: found.dateAlternatives,
        hoursOn: true,
        price: pool.price,
        exactOf: pool.exactOf,
      });
      expect(pool.calls[0]).toEqual([PICK, SECOND]);
      expect(got.wins).toEqual({});
    }
  });

  it('a stopped pricing gives no wins', async () => {
    const found = fixture();
    const got = await priceWithRunnerUps({
      goal: { kind: 'fastest' },
      rows: [found.byAscensions[4]!],
      alternatives: found.alternatives,
      hoursOn: true,
      price: async () => false,
      exactOf: () => undefined,
    });
    expect(got.ok).toBe(false);
    expect(got.wins).toEqual({});
  });
});

describe('which routes to price for a count', () => {
  it('routesToPrice: the pick alone with hours off; the pick and its next best with hours on, once', () => {
    expect(routesToPrice(PICK, SECOND, false)).toEqual([PICK]);
    expect(routesToPrice(PICK, SECOND, true)).toEqual([PICK, SECOND]);
    expect(routesToPrice(PICK, null, true)).toEqual([PICK]);
    expect(routesToPrice(PICK, [...PICK], true)).toEqual([PICK]);
  });
  it('nextBest: the first other kept route that is not the row (the polish can move the pick onto one)', () => {
    const found = fixture();
    expect(nextBest(PICK, found.alternatives![4])!.chain).toEqual(SECOND);
    expect(nextBest(SECOND, found.alternatives![4])!.chain).toEqual(THIRD);
    expect(nextBest(PICK, [])).toBeNull();
    expect(nextBest(PICK, undefined)).toBeNull();
  });
});

describe('exactWinner', () => {
  const at = (spareH: number, te = 248): ExactEnd => ({ end: DEADLINE - spareH * H, endTE: te });
  const date = { kind: 'date' as const, deadline: DEADLINE };
  it('Fastest: sooner by over a minute', () => {
    expect(exactWinner({ kind: 'fastest' }, at(10), at(11))).toEqual({ winner: 'alt', why: 'sooner' });
    expect(exactWinner({ kind: 'fastest' }, at(10), { end: DEADLINE - 10 * H - 30, endTE: 248 }).winner).toBe('pick');
    expect(exactWinner({ kind: 'fastest' }, null, at(1))).toEqual({ winner: 'alt', why: 'sooner' });
    expect(exactWinner({ kind: 'fastest' }, at(1), null).winner).toBe('pick');
  });
  it('By a date: makes it, then higher TE, then more to spare', () => {
    expect(exactWinner(date, at(-2), at(1))).toEqual({ winner: 'alt', why: 'makes' });
    expect(exactWinner(date, at(5, 247), at(1, 248))).toEqual({ winner: 'alt', why: 'higher' });
    expect(exactWinner(date, at(5, 248), at(9, 247)).winner).toBe('pick');
    expect(exactWinner(date, at(10.4), at(16.8))).toEqual({ winner: 'alt', why: 'spare' });
    expect(exactWinner(date, at(10.4), at(-1)).winner).toBe('pick');
  });
});

describe('the row note', () => {
  it('names the table pick and what the runner-up does better with your hours', () => {
    expect(secondNote('spare', PICK, '0.27 days')).toBe(
      'A route the instant answer ranked second has more to spare with your hours (its pick 161 198 224 248 has 0.27 days less).'
    );
    expect(secondNote('sooner', PICK, '0.27 days')).toBe(
      'A route the instant answer ranked second finishes sooner with your hours (its pick 161 198 224 248 is 0.27 days later).'
    );
    expect(secondNote('makes', PICK)).toContain('makes the date with your hours (its pick 161 198 224 248 misses it)');
    expect(secondNote('higher', PICK)).toContain('reaches more TE');
  });
});
