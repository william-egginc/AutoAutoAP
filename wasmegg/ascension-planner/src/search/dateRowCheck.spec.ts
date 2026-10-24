/**
 * By a date's Check exactly for one row (dateRowCheck.ts). The fixture is shaped on Jordan's main (22 Oct 2026, By
 * Jul 14, 2027 10:00 am, hours 7 am to 11 pm): the row's early stops miss 313, and lowering only the last stop fell to
 * 310, while other early stops reach more. A fake price list stands in for the simulator.
 */
import { describe, expect, it } from 'vitest';
import {
  NEARBY_DEAL,
  bestMaking,
  closestTo,
  nearbyRoutes,
  NEARBY_SPAN,
  pickNearbyRow,
  RUNNER_UPS,
  settleDateRow,
  worthNearby,
  type DatePrice,
} from './dateRowCheck';

const H = 3600;
const DEADLINE = 1_815_000_000;
const key = (c: readonly number[]) => c.join(',');

/** A fake simulator: listed routes end where they are told, every other one a day after the date. */
function prices(list: Record<string, number>) {
  const priced: number[][] = [];
  const known: Record<string, DatePrice> = {};
  const exactOf = (c: number[]) => known[key(c)];
  const price = async (chains: number[][]) => {
    for (const c of chains) {
      priced.push(c);
      const off = list[key(c)] ?? 24 * H;
      known[key(c)] = { end: DEADLINE + off, endTE: c[c.length - 1] };
    }
    return true;
  };
  return { priced, exactOf, price };
}

describe('nearbyRoutes', () => {
  it('moves each early stop 1 to 3 TE either way, one at a time, and never the final TE', () => {
    const out = nearbyRoutes([197, 225, 250, 282, 313], 192, undefined);
    expect(out).toHaveLength(4 * 2 * NEARBY_SPAN);
    expect(out.every(c => c[4] === 313)).toBe(true);
    // Nearest first: every ±1 before any ±2.
    expect(out.slice(0, 8).every(c => c.reduce((n, s, i) => n + Math.abs(s - [197, 225, 250, 282, 313][i]), 0) === 1)).toBe(true);
    expect(out.map(key)).toContain('197,222,250,282,313');
    expect(out.map(key)).toContain('197,225,250,285,313');
  });

  it('puts the runner-up rows first, with the row’s final TE, and leaves out invalid and priced routes', () => {
    const alts = [{ chain: [197, 222, 247, 285, 313] }, { chain: [197, 225, 277, 313] }, { chain: [196, 221, 246, 277, 313] }];
    const out = nearbyRoutes([194, 196, 250, 282, 313], 192, alts, { skip: [[196, 221, 246, 277, 313]] });
    expect(out[0]).toEqual([197, 222, 247, 285, 313]);
    // A runner-up with another count is not this row's; the priced one is skipped.
    expect(out.map(key)).not.toContain('197,225,277,313');
    expect(out.map(key)).not.toContain('196,221,246,277,313');
    // No stop at or below the player's TE, no two stops out of order.
    expect(out.every(c => c[0] > 192 && c.every((s, i) => !i || s > c[i - 1]))).toBe(true);
    expect(out.map(key)).not.toContain('194,194,250,282,313');
  });

  it('takes at most RUNNER_UPS runner-ups', () => {
    const alts = Array.from({ length: 6 }, (_, i) => ({ chain: [200 + i, 230, 260, 313] }));
    const out = nearbyRoutes([197, 225, 277, 313], 192, alts);
    expect(out.slice(0, RUNNER_UPS).map(c => c[0])).toEqual([200, 201, 202]);
    expect(out.filter(c => c[0] >= 200 && c[1] === 230)).toHaveLength(RUNNER_UPS);
  });
});

describe('NEARBY_DEAL', () => {
  it('deals the routes evenly, a contiguous share per worker', () => {
    const chains = nearbyRoutes([197, 225, 250, 282, 313], 192, undefined);
    const of = NEARBY_DEAL.workerOf!(chains, 4);
    expect(of).toHaveLength(24);
    expect([0, 1, 2, 3].map(w => of.filter(x => x === w).length)).toEqual([6, 6, 6, 6]);
    expect(of.every((w, i) => !i || w >= of[i - 1])).toBe(true);
  });
});

describe('bestMaking and closestTo', () => {
  it('picks the highest TE that makes the date, then the most to spare; and the closest miss', async () => {
    const { exactOf, price } = prices({ '1,2,10': -2 * H, '1,3,10': -5 * H, '1,4,10': 3 * H, '1,5,10': 1 * H });
    await price([[1, 2, 10], [1, 3, 10], [1, 4, 10], [1, 5, 10]]);
    expect(bestMaking([[1, 2, 10], [1, 3, 10]], DEADLINE, exactOf)).toEqual([1, 3, 10]);
    expect(bestMaking([[1, 4, 10], [1, 5, 10]], DEADLINE, exactOf)).toBeNull();
    expect(closestTo([[1, 4, 10], [1, 5, 10]], [1, 9, 10], exactOf)).toEqual([1, 5, 10]);
  });
});

describe('worthNearby', () => {
  it('only for a row that could beat the best TE so far, or tie it with fewer ascensions', () => {
    expect(worthNearby(313, 5, null)).toBe(true);
    expect(worthNearby(313, 5, { endTE: 310, ascensions: 4 })).toBe(true);
    expect(worthNearby(310, 3, { endTE: 310, ascensions: 4 })).toBe(true);
    expect(worthNearby(310, 5, { endTE: 310, ascensions: 4 })).toBe(false);
    expect(worthNearby(309, 3, { endTE: 310, ascensions: 4 })).toBe(false);
  });
});

describe('pickNearbyRow', () => {
  // The main account's rows on the Oct 18 save: 2 ascensions make it (305), the rest miss.
  const rows = [
    [240, 305],
    [221, 254, 284, 312],
    [197, 222, 247, 285, 313],
    [197, 222, 244, 269, 285, 313],
    [228, 279, 310],
  ].map(chain => ({ chain, legs: chain }));
  const misses = (r: { chain: number[] }) => r.chain.length !== 2;

  it('the highest final TE that misses, then the fewest ascensions', () => {
    expect(pickNearbyRow(rows, misses, { endTE: 305, ascensions: 2 })?.chain).toEqual([197, 222, 247, 285, 313]);
  });

  it('none when no row that misses could beat the best, or tie it with fewer ascensions', () => {
    expect(pickNearbyRow(rows, misses, { endTE: 313, ascensions: 4 })).toBeNull();
    expect(pickNearbyRow(rows, () => false, null)).toBeNull();
    expect(pickNearbyRow(rows, misses, { endTE: 313, ascensions: 6 })?.chain).toEqual([197, 222, 247, 285, 313]);
  });
});

describe('settleDateRow (Jordan’s main, 22 Oct)', () => {
  const ROW = [197, 225, 250, 282, 313];
  /** The row with its fourth stop at 285 makes it; the row's own early stops make it only with the last stop at
   *  310. */
  const LIST = {
    '197,225,250,285,313': -4 * H,
    '197,225,250,282,310': -30 * H,
    '197,225,250,282,311': 2 * H,
    '197,225,250,282,312': 1 * H,
  };

  it('before: lowering only the last stop falls to 310', async () => {
    const { exactOf, price, priced } = prices(LIST);
    await price([ROW]);
    const row = await settleDateRow({ chain: ROW, alt: null, currentTE: 192, deadline: DEADLINE, nearby: false, exactOf, price });
    expect(row.made).toEqual([197, 225, 250, 282, 310]);
    expect(row.nearbyPriced).toBe(0);
    expect(priced).toHaveLength(4);
  });

  it('after: a nearby early stop keeps 313, before any last stop is lowered', async () => {
    const { exactOf, price, priced } = prices(LIST);
    await price([ROW]);
    const how: string[] = [];
    const row = await settleDateRow({
      chain: ROW,
      alt: null,
      currentTE: 192,
      deadline: DEADLINE,
      nearby: true,
      exactOf,
      price: (c, h) => {
        how.push(h);
        return price(c);
      },
    });
    expect(row.made).toEqual([197, 225, 250, 285, 313]);
    expect(row.nearbyPriced).toBe(24);
    expect(row.lowerPriced).toBe(0);
    expect(how).toEqual(['nearby']);
    expect(priced).toHaveLength(25);
  });

  it('a runner-up row’s early stops win over a nearby one when they reach the same TE with more to spare', async () => {
    const { exactOf, price } = prices({ ...LIST, '197,222,247,285,313': -16 * H });
    await price([ROW]);
    const row = await settleDateRow({
      chain: ROW,
      alt: null,
      currentTE: 192,
      deadline: DEADLINE,
      alternatives: [{ chain: [197, 222, 247, 285, 313] }],
      nearby: true,
      exactOf,
      price,
    });
    expect(row.made).toEqual([197, 222, 247, 285, 313]);
    expect(row.nearbyPriced).toBe(25);
  });

  it('when nothing at the row’s TE makes it, lowers the last stop from the closest early stops', async () => {
    // 197 225 250 283 313 misses by only an hour (the closest), and makes it at 312; the row's own stops need 310.
    const { exactOf, price, priced } = prices({
      '197,225,250,283,313': 1 * H,
      '197,225,250,283,312': -20 * H,
      '197,225,250,282,310': -30 * H,
    });
    await price([ROW]);
    const row = await settleDateRow({ chain: ROW, alt: null, currentTE: 192, deadline: DEADLINE, nearby: true, exactOf, price });
    expect(row.made).toEqual([197, 225, 250, 283, 312]);
    expect(row.lowerPriced).toBe(3);
    expect(priced.slice(-3)).toEqual([
      [197, 225, 250, 283, 312],
      [197, 225, 250, 283, 311],
      [197, 225, 250, 283, 310],
    ]);
  });

  it('prices nothing more when the row or its runner-up makes the date', async () => {
    const { exactOf, price, priced } = prices({ '197,225,250,282,313': -1 * H, '197,222,247,285,313': -16 * H });
    await price([ROW, [197, 222, 247, 285, 313]]);
    const own = await settleDateRow({ chain: ROW, alt: [197, 222, 247, 285, 313], currentTE: 192, deadline: DEADLINE, nearby: true, exactOf, price });
    expect(own.made).toEqual(ROW);
    expect(own.altMade).toEqual([197, 222, 247, 285, 313]);
    expect(priced).toHaveLength(2);
  });

  it('stops when the check is stopped', async () => {
    const { exactOf, price } = prices({});
    await price([ROW]);
    const row = await settleDateRow({
      chain: ROW,
      alt: null,
      currentTE: 192,
      deadline: DEADLINE,
      nearby: true,
      exactOf,
      price: async () => false,
    });
    expect(row.ok).toBe(false);
  });
});
