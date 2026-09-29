/**
 * The deadline search, against a stand-in for the simulator whose true answer can be brute-forced.
 */
import { describe, expect, it } from 'vitest';
import type { ChainResult } from './types';
import {
  bandShapes,
  countBandShapes,
  parseStopBox,
  countShapes,
  firstStopValues,
  gridValues,
  rank,
  runDeadlineSearch,
  stepForBudget,
  type DeadlineSpec,
} from './deadline';

const DAY = 86400;
const START = 1_790_000_000;

/** A leg from TE `a` to `b`: a day to rebuild, then slower per TE the lower you start. Prestiging
 *  is worth it, but only so often -- so the best shape depends on the deadline, like the real thing. */
function legSeconds(a: number, b: number): number {
  return DAY + (b - a) * DAY * (150 / (a + 20));
}
function priceChain(currentTE: number, chain: number[]): ChainResult {
  let te = currentTE;
  let seconds = 0;
  for (const c of chain) {
    seconds += legSeconds(te, c);
    te = c;
  }
  return { chain: [...chain], seconds, legs: [] };
}

function spec(over: Partial<DeadlineSpec> = {}): DeadlineSpec {
  return {
    currentTE: 100,
    planStart: START,
    deadline: START + 90 * DAY,
    minStops: 1,
    maxStops: 4,
    lastLo: 110,
    lastHi: 200,
    step: 5,
    ...over,
  };
}

/** Every strictly increasing route to every last stop, step 1: the true answer. */
function bruteForce(s: DeadlineSpec): { t: number; spare: number } {
  let bestT = -1;
  let bestSpare = -1;
  const walk = (prefix: number[]) => {
    const floor = (prefix[prefix.length - 1] ?? s.currentTE) + 1;
    for (let t = Math.max(floor, s.lastLo); t <= s.lastHi; t++) {
      const r = priceChain(s.currentTE, [...prefix, t]);
      const spare = s.deadline - (s.planStart + r.seconds);
      if (spare >= 0 && (t > bestT || (t === bestT && spare > bestSpare))) {
        bestT = t;
        bestSpare = spare;
      }
    }
    if (prefix.length + 1 < s.maxStops) for (let v = floor; v < s.lastHi; v++) walk([...prefix, v]);
  };
  walk([]);
  return { t: bestT, spare: bestSpare };
}

async function search(s: DeadlineSpec) {
  let calls = 0;
  const out = await runDeadlineSearch(s, {
    evaluate: async chains => {
      calls += chains.length;
      return chains.map(c => priceChain(s.currentTE, c));
    },
  });
  return { ...out, calls };
}

describe('deadline search', () => {
  it('finds the same highest last stop as trying every route, for far less pricing', async () => {
    const s = spec({ lastHi: 170, maxStops: 3 });
    const truth = bruteForce(s);
    const out = await search(s);
    const best = out.routes[0];
    expect(best.chain[best.chain.length - 1]).toBe(truth.t);
    // Same TE; the spare time may differ only if the fine pass missed a better shape at that TE.
    expect(best.spare).toBeGreaterThanOrEqual(truth.spare - 1e-6);
    expect(out.calls).toBeLessThan(3000);
  });

  it('gets there from a coarse 20-TE grid too, by homing in', async () => {
    const s = spec({ lastHi: 170, maxStops: 3, step: 20 });
    const truth = bruteForce(s);
    const out = await search(s);
    expect(out.step).toBe(20);
    expect(out.routes[0].chain.at(-1)).toBe(truth.t);
  });

  it('never lists a route that misses the deadline', async () => {
    const out = await search(spec());
    for (const r of out.routes) expect(r.reachAt).toBeLessThanOrEqual(START + 90 * DAY);
  });

  it('gives the best route for each stop count, and ranks by last stop then spare time', async () => {
    const out = await search(spec());
    expect([...out.byStops.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < out.routes.length; i++) {
      const [a, b] = [out.routes[i - 1], out.routes[i]];
      const ta = a.chain[a.chain.length - 1];
      const tb = b.chain[b.chain.length - 1];
      expect(ta > tb || (ta === tb && a.spare >= b.spare)).toBe(true);
    }
  });

  it('counts the time to ascend, when the player has to be awake for it', async () => {
    // Awake only in the first 12 h of each day: reaching the last stop at night means waiting.
    const ascendAt = (t: number) => {
      const into = (t - START) % DAY;
      return into < DAY / 2 ? t : t - into + DAY;
    };
    const plain = await search(spec());
    const awake = await search(spec({ ascendAt }));
    const tp = plain.routes[0].chain.at(-1)!;
    const ta = awake.routes[0].chain.at(-1)!;
    expect(ta).toBeLessThanOrEqual(tp);
    for (const r of awake.routes) expect(r.ascendAt).toBeLessThanOrEqual(START + 90 * DAY);
  });

  it('raises the grid step to fit the budget, and says which it used', () => {
    const s = spec({ lastHi: 300, maxStops: 6, step: 1, maxShapes: 3000 });
    const step = stepForBudget(s);
    expect(countShapes(s, step)).toBeLessThanOrEqual(3000);
    expect(step).toBeGreaterThan(1);
    expect(gridValues(100, 300, step).every(v => v > 100 && v < 300)).toBe(true);
  });

  it('stops when asked, and says so', async () => {
    let n = 0;
    const out = await runDeadlineSearch(spec(), {
      evaluate: async chains => chains.map(c => priceChain(100, c)),
      shouldStop: () => ++n > 3,
    });
    expect(out.stoppedEarly).toBe(true);
  });

  it('keeps only each shape’s best last stop in the ranking', () => {
    const r = (chain: number[], spare: number) => ({ chain, reachAt: 0, ascendAt: 0, spare, legs: [] });
    const ranked = rank([r([120, 150], 5), r([120, 148], 50), r([130, 150], 9)]);
    expect(ranked.map(x => x.chain.join(' '))).toEqual(['130 150', '120 150']);
  });
});

describe('the first stop, which the grid would miss', () => {
  it('is tried at every TE just above the current one, as well as on the grid', () => {
    expect(firstStopValues(137, 300, 20).slice(0, 7)).toEqual([138, 139, 140, 141, 142, 160, 180]);
  });

  it('finds a best first stop that sits between grid points', async () => {
    // Ascending first at exactly 102 is worth ten days; anywhere else is not. A 20-TE grid alone
    // (120, 140, ...) can never offer it.
    const s = spec({ lastHi: 200, maxStops: 3, step: 20 });
    const out = await runDeadlineSearch(s, {
      evaluate: async chains =>
        chains.map(c => {
          const r = priceChain(100, c);
          return c.length > 1 && c[0] === 102 ? { ...r, seconds: r.seconds - 10 * DAY } : r;
        }),
    });
    expect(out.routes[0].chain[0]).toBe(102);
  });

  it("starts from the caller's own route", async () => {
    const batches: string[][] = [];
    await runDeadlineSearch(spec({ lastHi: 170, maxStops: 3, step: 20, seedShapes: [[113, 147]] }), {
      evaluate: async chains => {
        batches.push(chains.map(c => c.slice(0, -1).join(' ')));
        return chains.map(c => priceChain(100, c));
      },
    });
    // In the very first batch: the seed pass, before any of the grid.
    expect(batches[0]).toContain('113 147');
  });
});

describe('your own space, Insane-style', () => {
  it('reads a box the way Insane reads a band, commas included', () => {
    expect(parseStopBox('138-142:1, 150, 160-170:5')).toEqual([138, 139, 140, 141, 142, 150, 160, 165, 170]);
    expect(parseStopBox('')).toEqual([]);
  });

  it('counts the sets of early stops without building them', () => {
    const bands = [
      [101, 102, 103, 110],
      [105, 110, 120],
      [120, 130, 140],
    ];
    expect(countBandShapes(bands, 100, 135)).toBe(bandShapes(bands, 100, 135).length);
    expect(bandShapes(bands, 100, 135).every(s => s[0] < s[1] && s[1] < s[2] && s[2] < 135)).toBe(true);
  });

  it('tries exactly the space, and finds the same answer as trying every route in it', async () => {
    const bands = [
      [101, 103, 105, 110],
      [115, 120, 125, 130],
    ];
    const s = spec({ lastLo: 131, lastHi: 170, bands });
    const seen = new Set<string>();
    const out = await runDeadlineSearch(s, {
      evaluate: async chains => {
        for (const c of chains) seen.add(c.slice(0, -1).join(' '));
        return chains.map(c => priceChain(100, c));
      },
    });
    // Nothing outside the boxes...
    const allowed = new Set(bandShapes(bands, 100, 170).map(x => x.join(' ')));
    for (const k of seen) expect(allowed.has(k)).toBe(true);
    // ...and the best of everything in them.
    let bestT = -1;
    for (const shape of bandShapes(bands, 100, 170)) {
      for (let t = 131; t <= 170; t++) {
        if (t <= shape[shape.length - 1]) continue;
        const r = priceChain(100, [...shape, t]);
        if (START + r.seconds <= s.deadline) bestT = Math.max(bestT, t);
      }
    }
    expect(out.routes[0].chain.at(-1)).toBe(bestT);
    expect(out.step).toBe(0);
  });
});
