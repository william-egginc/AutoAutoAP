/**
 * Driver and batching tests against a SYNTHETIC cost landscape.
 *
 * Deliberately separate from chain.spec.ts: that one proves the evaluator scores a chain the way the
 * CLI does (and costs ~80 s and a real player backup to do it). This one proves the SEARCH LOGIC —
 * the window that must not walk, the descent that must find a minimum, the stop that must leave a
 * usable answer — and it runs in milliseconds because the "simulator" is arithmetic.
 *
 * The two failure modes asserted here are both real, observed regressions recorded in
 * scripts/autoplan.py: `resolve_last` re-centring on its own window edge and walking to 450+, and a
 * pass that regresses losing the best chain already seen.
 */
import { describe, expect, it } from 'vitest';
import { splitByPrefix, workersForBatch } from './batch';
import { defaultMaxLast, plannedCountChecks, runChainSearch, type EvaluateBatch } from './driver';
import { EFFORT, estimateChains, estimateOtherCountChains } from './effort';
import type { ChainResult } from './types';

const FINAL = 490;
const CURRENT_TE = 175;

/**
 * A separable landscape with its minimum at a known chain. Each checkpoint contributes a quadratic
 * penalty for being away from its optimum, so coordinate descent is guaranteed to reach it — which
 * is the point: this test is about the driver's bookkeeping, not about a hard optimisation problem.
 */
function makeEvaluator(optimum: number[]): { evaluate: EvaluateBatch; calls: number[][][] } {
  const calls: number[][][] = [];
  const evaluate: EvaluateBatch = async chains => {
    calls.push(chains);
    const results: ChainResult[] = chains.map(chain => {
      let cost = 700 * 86400;
      for (let i = 0; i < chain.length - 1; i++) {
        const target = optimum[i] ?? chain[i];
        cost += (chain[i] - target) ** 2 * 600;
      }
      return { chain: [...chain], seconds: cost, legs: [] };
    });
    return { results, legSims: chains.length, workersUsed: 1 };
  };
  return { evaluate, calls };
}

describe('runChainSearch', () => {
  /**
   * The last checkpoint must be swept even when the seed puts it outside the legal range.
   *
   * `maxLast` (final - 150 = 340 here) caps the last checkpoint, but nothing that PRODUCES a seed
   * respects that cap -- the coarse scan sweeps a fixed 185..390 grid and returns whatever won.
   * `resolveLast` used to centre its window on the incoming value, so a seed of 360 gave
   * `lo = 348 > hi = 340`, an empty window, and a silent return. It then no-opped for the whole
   * run, including the re-solve after every accepted descent move, leaving the last checkpoint to
   * drift by descent's +-8 alone.
   *
   * Observed on a real 9795-chain `thorough` run: it settled at 742.378 d with A6=359 while
   * 741.500 d sat at A6=328 -- inside the range this sweep was supposed to cover, and never priced.
   * The optimum below is 31 away from the seed for exactly that reason: a radius-8 descent cannot
   * bridge it, so only a working sweep can.
   */
  it('sweeps the last checkpoint even when the seed starts above maxLast', async () => {
    const optimum = [195, 219, 248, 286, 328];
    const { evaluate } = makeEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [195, 219, 248, 286, 360, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
    });
    expect(out.chain).toEqual([...optimum, FINAL]);
  });

  it('finds a separable optimum by coordinate descent', async () => {
    const optimum = [195, 219, 248, 286, 327];
    const { evaluate } = makeEvaluator(optimum);

    const outcome = await runChainSearch({
      seedChain: [190, 225, 255, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
    });

    expect(outcome.chain).toEqual([...optimum, FINAL]);
    expect(outcome.stoppedEarly).toBe(false);
    // Fast's last stage is now its check of the other ascension counts (stage 4c).
    expect(outcome.lastCompletedStage).toBe('other ascension counts');
  });

  it('never lets the last checkpoint walk past maxLast', async () => {
    // A landscape that rewards pushing the last checkpoint ever higher — exactly the shape that made
    // an earlier `resolve_last` re-centre on its own window edge and climb to 450+ against a final
    // of 490. `maxLast` (final - 150 = 340) is the hard stop.
    const evaluate: EvaluateBatch = async chains => ({
      results: chains.map(chain => ({
        chain: [...chain],
        seconds: (900 - chain[chain.length - 2]) * 86400,
        legs: [],
      })),
      legSims: chains.length,
      workersUsed: 1,
    });

    const outcome = await runChainSearch({
      seedChain: [195, 219, 248, 286, 300, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
    });

    expect(outcome.chain[outcome.chain.length - 2]).toBeLessThanOrEqual(FINAL - 150);
  });

  it('stops between batches and still returns the best chain seen', async () => {
    const { evaluate } = makeEvaluator([195, 219, 248, 286, 327]);
    let batches = 0;
    const counting: EvaluateBatch = async chains => {
      batches++;
      return evaluate(chains);
    };

    const outcome = await runChainSearch({
      seedChain: [190, 225, 255, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      evaluateBatch: counting,
      shouldStop: () => batches >= 2,
    });

    expect(outcome.stoppedEarly).toBe(true);
    // Stopping must never be worse than the seed: `ever` only ever moves downward.
    expect(outcome.seconds).toBeLessThanOrEqual(700 * 86400 + (190 - 195) ** 2 * 600 + 1e6);
    expect(outcome.chain[outcome.chain.length - 1]).toBe(FINAL);
  });

  /**
   * A stop in the middle of a step still returns the fastest chain priced. `ever` was only moved at
   * the end of each step, so a run stopped mid-sweep returned the step before's best while a faster
   * chain from the sweep sat in the cache: 895.745 d returned with 893.752 d priced (1 Oct, a
   * command-line Smart search stopped during stage 4a). The stop here lands right after the last
   * checkpoint's sweep has priced its candidates, before that step records its winner.
   */
  it('returns the fastest chain priced even when stopped in the middle of a step', async () => {
    const { evaluate } = makeEvaluator([195, 219, 248, 286, 327]);
    const priced: ChainResult[] = [];
    let batches = 0;
    const recording: EvaluateBatch = async chains => {
      batches++;
      const out = await evaluate(chains);
      priced.push(...out.results);
      return out;
    };

    const outcome = await runChainSearch({
      seedChain: [195, 219, 248, 286, 340, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      evaluateBatch: recording,
      shouldStop: () => batches >= 2,
    });

    const fastest = Math.min(...priced.map(r => r.seconds));
    expect(outcome.stoppedEarly).toBe(true);
    expect(outcome.seconds).toBe(fastest);
  });

  /**
   * 9 Oct (Fastest › Simple, 7 workers): the bar sat on "1 of ~606 chains · about 57 min left" for a
   * while at the start. The seed was priced alone (one chain, one worker, the rest idle) and that
   * chain, start-up included, was the first rate sample. The seed now rides in the last
   * checkpoint's first sweep: the first batch is the whole sweep, seed included.
   */
  it('prices the seed in the first sweep, not alone first', async () => {
    const { evaluate, calls } = makeEvaluator([195, 219, 248, 286, 327]);
    const seed = [195, 219, 248, 286, 320, FINAL];
    const stages: string[] = [];
    const out = await runChainSearch({
      seedChain: seed,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
      onProgress: p => stages.push(`${p.stage}|${p.chainsDone}|${p.bestDays}`),
    });
    expect(calls[0].length).toBeGreaterThan(1);
    expect(calls[0].map(c => c.join(','))).toContain(seed.join(','));
    // Nothing priced twice.
    const all = calls.flat().map(c => c.join(','));
    expect(new Set(all).size).toBe(all.length);
    // The first report says nothing is priced yet (0, never Infinity), and descent says so itself
    // before its first axis rather than after it.
    expect(stages[0]).toBe('stage 4a: solving the last stop|0|0');
    expect(stages.some(s => s.startsWith('stage 4: coordinate descent|'))).toBe(true);
    const firstDescent = stages.findIndex(s => s.startsWith('stage 4: coordinate descent|'));
    expect(Number(stages[firstDescent].split('|')[1])).toBe(calls[0].length);
    expect(out.chain).toEqual([195, 219, 248, 286, 327, FINAL]);
  });

  it('prices a seed whose last checkpoint is out of range in the same first batch', async () => {
    const { evaluate, calls } = makeEvaluator([195, 219, 248, 286, 328]);
    const seed = [195, 219, 248, 286, 360, FINAL]; // 360 > maxLast 340: not in the sweep's window
    const out = await runChainSearch({
      seedChain: seed,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
    });
    expect(calls[0].map(c => c.join(','))).toContain(seed.join(','));
    expect(calls[0].length).toBeGreaterThan(1);
    expect(out.chain).toEqual([195, 219, 248, 286, 328, FINAL]);
  });

  it('replays a restored cache without re-evaluating anything', async () => {
    const optimum = [195, 219, 248, 286, 327];
    const first = makeEvaluator(optimum);
    const done = await runChainSearch({
      seedChain: [190, 225, 255, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: first.evaluate,
      onCache: () => {},
    });

    // Re-run from the same seed with the previous run's cache restored. Every chain the first run
    // priced must come back as a cache hit, so the second run's evaluator sees strictly fewer
    // chains — that is what makes a refresh mid-run cheap.
    const entries: { key: string; seconds: number; legs: [] }[] = [];
    await runChainSearch({
      seedChain: [190, 225, 255, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: first.evaluate,
      onCache: e => {
        entries.length = 0;
        entries.push(...(e as typeof entries));
      },
    });

    const second = makeEvaluator(optimum);
    const resumed = await runChainSearch({
      seedChain: [190, 225, 255, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: second.evaluate,
      restoredCache: entries,
    });

    expect(resumed.chain).toEqual(done.chain);
    expect(resumed.chainsEvaluated).toBeLessThan(done.chainsEvaluated);
  });
});

/** A landscape that also prices how many ascensions there are: each checkpoint has to sit near one
 *  of the optimum's, and each of the optimum's needs a checkpoint near it. */
function makeCountEvaluator(optimum: number[]): { evaluate: EvaluateBatch; priced: () => number } {
  let priced = 0;
  const evaluate: EvaluateBatch = async chains => {
    priced += chains.length;
    return {
      results: chains.map(chain => {
        const pts = chain.slice(0, -1);
        let cost = 700 * 86400;
        for (const p of pts) cost += Math.min(...optimum.map(o => (p - o) ** 2)) * 600;
        for (const o of optimum) cost += Math.min(...pts.map(p => (p - o) ** 2)) * 600;
        return { chain: [...chain], seconds: cost, legs: [] };
      }),
      legSims: chains.length,
      workersUsed: 1,
    };
  };
  return { evaluate, priced: () => priced };
}

describe('the ascension-count probe', () => {
  const optimum = [195, 219, 248, 286, 327];

  it('runs on Exact, and keeps going while the count keeps changing', async () => {
    // Seed has two checkpoints too many: one round moves it to 6, the next to 5.
    const { evaluate } = makeCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [185, 200, 220, 245, 265, 290, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      minCheckpoints: 4,
      maxCheckpoints: 9,
      evaluateBatch: evaluate,
    });
    expect(out.chain.length - 1).toBe(5);
    expect(out.chain).toEqual([...optimum, FINAL]);
  });

  it('stays inside the limits however far the best count is', async () => {
    const { evaluate } = makeCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [185, 200, 220, 245, 265, 290, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      minCheckpoints: 7,
      maxCheckpoints: 9,
      evaluateBatch: evaluate,
    });
    expect(out.chain.length - 1).toBeGreaterThanOrEqual(7 - 1);
  });

  it('costs only a little when the count is already right', async () => {
    const seed = [190, 225, 255, 280, 320, FINAL];
    const run = async (effort: 'quick' | 'normal') => {
      const { evaluate, priced } = makeCountEvaluator(optimum);
      await runChainSearch({ seedChain: seed, final: FINAL, currentTE: CURRENT_TE, effort, evaluateBatch: evaluate });
      return priced();
    };
    // Quick has no pairs step, so compare Exact to itself with the check removed by a tight limit.
    const { evaluate: e1, priced: p1 } = makeCountEvaluator(optimum);
    await runChainSearch({
      seedChain: seed,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      minCheckpoints: 6,
      maxCheckpoints: 6,
      evaluateBatch: e1,
    });
    expect(await run('normal')).toBeLessThan(p1() * 1.3);
  });
});

/**
 * `makeCountEvaluator`, plus a day for every checkpoint more or fewer than the optimum has (an extra
 * ascension costs a rebuild in the game; without this, two checkpoints a step apart near one optimum
 * cost almost nothing), recording every chain length it was asked to price.
 */
function makeRecordingCountEvaluator(optimum: number[]) {
  const inner = makeCountEvaluator(optimum);
  const lengths = new Set<number>();
  const evaluate: EvaluateBatch = async chains => {
    for (const c of chains) lengths.add(c.length);
    const out = await inner.evaluate(chains);
    return {
      ...out,
      results: out.results.map(r => ({
        ...r,
        seconds: r.seconds + Math.abs(r.chain.length - 1 - optimum.length) * 86400,
      })),
    };
  };
  return { evaluate, priced: inner.priced, lengths };
}

/**
 * Fast has no count probe, so it used to keep the seed's count: a Fast run held at 4 ascensions
 * finished ~4 days behind a 5-7 ascension route (row 57db9894). Stage 4c gives each other count one
 * descent pass and walks outward while the edge wins, inside the limits.
 */
describe("Fast's check of the other ascension counts", () => {
  // Six checkpoints: the best route has 7 ascensions.
  const optimum = [190, 212, 236, 262, 292, 326];
  const SEED4 = [205, 260, 320, FINAL];

  it('finds a better count than the seed by walking outward, with no instant answer', async () => {
    const { evaluate } = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: SEED4,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 2,
      maxCheckpoints: 9,
      evaluateBatch: evaluate,
    });
    expect(out.chain.length).toBe(7);
    expect(out.chain).toEqual([...optimum, FINAL]);
    // The seed's count first, then the walk: 3 and 5 (one either side), 6, 7, and 8 to see 7 is best.
    expect(out.countsProbed[0]).toBe(4);
    expect([...out.countsProbed].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(out.lastCompletedStage).toBe('other ascension counts');
  });

  it("starts each count from the instant answer's route at that count", async () => {
    const { evaluate } = makeRecordingCountEvaluator(optimum);
    const near7 = [188, 214, 233, 265, 290, 330, FINAL];
    const progress: number[][] = [];
    const out = await runChainSearch({
      seedChain: SEED4,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 4,
      maxCheckpoints: 8,
      // Fastest first, as the store passes them; a route to another target is ignored.
      countSeeds: [near7, [200, 250, 300, 480], [200, 240, 280, 320, FINAL]],
      evaluateBatch: evaluate,
      onProgress: p => progress.push(p.countsProbed ?? []),
    });
    expect(out.chain).toEqual([...optimum, FINAL]);
    expect(out.countsProbed).toContain(7);
    expect(progress.at(-1)).toEqual(out.countsProbed);
  });

  it('stays inside the limits, and ignores instant routes outside them', async () => {
    const { evaluate, lengths } = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [205, 240, 280, 320, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 4,
      maxCheckpoints: 6,
      countSeeds: [[...optimum, FINAL]],
      evaluateBatch: evaluate,
    });
    expect(out.chain.length).toBe(6);
    expect([...lengths].every(n => n >= 4 && n <= 6)).toBe(true);
    expect([...out.countsProbed].sort((a, b) => a - b)).toEqual([4, 5, 6]);
  });

  it('checks nothing else when the limits allow only the seed count', async () => {
    const { evaluate, lengths } = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: SEED4,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 4,
      maxCheckpoints: 4,
      countSeeds: [[...optimum, FINAL]],
      evaluateBatch: evaluate,
    });
    expect([...lengths]).toEqual([4]);
    expect(out.countsProbed).toEqual([4]);
  });

  it('does not run on Exact, which has the count probe instead', async () => {
    const { evaluate } = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [...optimum, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'normal',
      minCheckpoints: 7,
      maxCheckpoints: 7,
      countSeeds: [SEED4],
      evaluateBatch: evaluate,
    });
    expect(out.countsProbed).toEqual([7]);
    expect(out.lastCompletedStage).toBe('prestige-count probe');
  });

  it("counts the extra probes in the run's estimate", async () => {
    const seeds = [
      [200, 240, 280, 320, FINAL],
      [...optimum, FINAL],
    ];
    const planned = plannedCountChecks({
      seedLen: 4,
      minLen: 3,
      maxLen: 8,
      final: FINAL,
      currentTE: CURRENT_TE,
      seeds,
    });
    // One either side of the seed, plus the instant answer's 7.
    expect(planned).toEqual([3, 5, 7]);
    const extra = estimateOtherCountChains(planned, EFFORT.quick);
    expect(extra).toBeGreaterThan(0);
    expect(estimateChains(3, EFFORT.quick, planned)).toBe(estimateChains(3, EFFORT.quick) + extra);
    // Exact has no stage 4c, so the counts change nothing there.
    expect(estimateChains(3, EFFORT.normal, planned)).toBe(estimateChains(3, EFFORT.normal));

    const estimates: number[] = [];
    const { evaluate } = makeRecordingCountEvaluator(optimum);
    await runChainSearch({
      seedChain: SEED4,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 3,
      maxCheckpoints: 8,
      countSeeds: seeds,
      evaluateBatch: evaluate,
      onProgress: p => estimates.push(p.chainsEstimated),
    });
    expect(estimates[0]).toBe(estimateChains(3, EFFORT.quick, planned));
  });

  it('skips the pass at a count that is days behind once its last checkpoint is solved', async () => {
    const far8 = [180, 200, 215, 250, 270, 300, 320, FINAL];
    const priced: number[][] = [];
    const inner = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [...optimum, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 7,
      maxCheckpoints: 8,
      countSeeds: [far8],
      evaluateBatch: async chains => {
        priced.push(...chains);
        return inner.evaluate(chains);
      },
    });
    expect(out.countsProbed).toEqual([7, 8]);
    // Only the last checkpoint moved at 8: every 8-ascension chain priced shares the start's prefix.
    const eights = priced.filter(c => c.length === 8);
    expect(eights.length).toBeGreaterThan(0);
    expect(new Set(eights.map(c => c.slice(0, -2).join(','))).size).toBe(1);
  });

  it('costs about what the estimate says when the seed count is already right', async () => {
    const seed = [...optimum, FINAL];
    const { evaluate, priced } = makeRecordingCountEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: seed,
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      minCheckpoints: 5,
      maxCheckpoints: 9,
      evaluateBatch: evaluate,
    });
    expect(out.chain).toEqual(seed);
    const planned = plannedCountChecks({ seedLen: 7, minLen: 5, maxLen: 9, final: FINAL, currentTE: CURRENT_TE });
    expect(planned).toEqual([6, 8]);
    expect(priced()).toBeLessThanOrEqual(estimateChains(6, EFFORT.quick, planned));
  });
});

describe('the last checkpoint and the 3-D slices', () => {
  it('lets the last checkpoint sit one above the one before it', async () => {
    // Optimum 300 then 301: the old floor (previous + 2) could never price 301 for the last one.
    const { evaluate } = makeEvaluator([200, 300, 301]);
    const out = await runChainSearch({
      seedChain: [200, 300, 310, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'quick',
      evaluateBatch: evaluate,
    });
    expect(out.chain.slice(0, -1)).toEqual([200, 300, 301]);
  });

  it('never prices a 3-D move above maxLast', async () => {
    const { evaluate, calls } = makeEvaluator([195, 219, 248, 286, 400]);
    await runChainSearch({
      seedChain: [195, 219, 248, 286, 330, FINAL],
      final: FINAL,
      currentTE: CURRENT_TE,
      effort: 'thorough',
      evaluateBatch: evaluate,
    });
    const last = calls.flat().map(c => c[c.length - 2]);
    expect(Math.max(...last)).toBeLessThanOrEqual(FINAL - 150);
  });
});

/**
 * A custom target below 490 (math review, 22 Oct 2026, finding 3): the old default cap `final - 150` put the last
 * stop of a 312 target at 162, below the player's TE, so `resolveLast` returned at once, the last pair's slices were
 * empty and Nearby routes never moved the last stop. The landscape is the board's 312 route from TE 192
 * (197 222 247 285 312) with the seed's last stop 30 below it, out of descent's reach in one pass.
 */
describe('a target below 490', () => {
  it('keeps final - 150 for 490 and lets a lower target move its last stop up to final - 2', () => {
    expect(defaultMaxLast(490)).toBe(340);
    expect(defaultMaxLast(312)).toBe(310);
    expect(defaultMaxLast(320)).toBe(318);
    // Never above the highest stop a route continues from (routeFinder.ts USEFUL_STOP_MAX).
    expect(defaultMaxLast(450)).toBe(360);
  });

  it('sweeps the last stop of a 312 target', async () => {
    const optimum = [197, 222, 247, 285];
    const { evaluate, calls } = makeEvaluator(optimum);
    const out = await runChainSearch({
      seedChain: [197, 222, 247, 255, 312],
      final: 312,
      currentTE: 192,
      effort: 'quick',
      evaluateBatch: evaluate,
    });
    expect(out.chain).toEqual([...optimum, 312]);
    // The last stop's sweep went above the old cap (162) and never reached the target itself.
    const last = calls.flat().map(c => c[c.length - 2]);
    expect(Math.max(...last)).toBeGreaterThan(285);
    expect(Math.max(...last)).toBeLessThanOrEqual(310);
  });
});

describe('batch splitting', () => {
  it('sizes the pool to the batch, not the CPU', () => {
    // The measured failure: a 13-chain batch spread over 12 workers is mostly overhead. Two chains
    // per worker is the floor.
    expect(workersForBatch(13, 12)).toBe(7);
    expect(workersForBatch(1, 12)).toBe(1);
    expect(workersForBatch(400, 12)).toBe(12);
  });

  it('cuts on whole prefix subtrees rather than round-robin over chains', () => {
    // A coordinate-descent sweep of the THIRD checkpoint: everything shares `195,219`. Cutting at
    // depth 1 or 2 would put every chain in one bucket, so the cut has to fall at depth 3.
    const chains = [240, 241, 242, 243].map(v => [195, 219, v, 286, 327, FINAL]);
    const buckets = splitByPrefix(chains, 4);
    expect(buckets.length).toBe(4);
    expect(buckets.flat().length).toBe(4);

    // A sweep of the LAST checkpoint over two distinct third-checkpoint subtrees must keep each
    // subtree whole, so each worker re-simulates the shared prefix at most once.
    const twoSubtrees = [
      ...[320, 321, 322].map(v => [195, 219, 248, 286, v, FINAL]),
      ...[320, 321, 322].map(v => [195, 219, 250, 286, v, FINAL]),
    ];
    const split = splitByPrefix(twoSubtrees, 2);
    expect(split.length).toBe(2);
    for (const bucket of split) {
      expect(new Set(bucket.map(c => c[2])).size).toBe(1);
    }
  });
});
