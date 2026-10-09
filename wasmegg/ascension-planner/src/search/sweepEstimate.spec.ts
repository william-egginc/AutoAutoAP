import { describe, expect, it } from 'vitest';
import { addChainSample, formatTimeLeft, relativeChainCost, sweepTimeLeft } from './sweepEstimate';

/** Samples as the store takes them: one report a second, `perSecond` fresh chains each, on top of
 *  `replayed` chains a carry-on brought back. Returns the samples and the chains done (replayed in). */
function priced(seconds: number, perSecond: number, replayed = 0, t0 = 1_000_000) {
  let samples: [number, number][] = addChainSample([], t0, replayed, replayed);
  let done = replayed;
  for (let s = 1; s <= seconds; s++) {
    done = replayed + Math.round(s * perSecond);
    samples = addChainSample(samples, t0 + s * 1000, done, replayed);
  }
  return { samples, done };
}

describe('the Full sweep time left (the user, 9 Oct: a 3-chain queue carried on after a refresh)', () => {
  it('a carry-on: the replayed chains are no speed at all -- measuring until the workers have priced some', () => {
    // 4,393 chains replayed in a moment; the old figure was elapsed x left / done = "about 2 min".
    const { samples } = priced(0, 0, 4393);
    const left = sweepTimeLeft({ samples, done: 4393, total: 34_375, ascensions: 7 });
    expect(left.seconds).toBeNull();
    expect(left.measuring).toBe(true);
    expect(left.chainsLeft).toBe(34_375 - 4393);
  });

  it('then the rate of the fresh chains alone, "(measuring…)" until two minutes of them', () => {
    // 2 chains a second (0.5 s/chain on the pool), 10 s in.
    const early = priced(10, 2, 4393);
    const a = sweepTimeLeft({ samples: early.samples, done: early.done, total: 34_375, ascensions: 7 });
    expect(a.measuring).toBe(true);
    expect(a.seconds).toBeCloseTo((34_375 - early.done) / 2, -1);
    const later = priced(180, 2, 4393);
    const b = sweepTimeLeft({ samples: later.samples, done: later.done, total: 34_375, ascensions: 7 });
    expect(b.measuring).toBe(false);
    // About 4.1 hours, not minutes.
    expect(b.seconds! / 3600).toBeGreaterThan(4);
    expect(b.seconds! / 3600).toBeLessThan(4.3);
  });

  it('covers the whole queue: the chain running, then the ones after it at their own length', () => {
    const { samples, done } = priced(180, 2);
    const queue = { at: 0, counts: [34_375, 52_000, 45_817], ascensions: [7, 6, 5] };
    const left = sweepTimeLeft({ samples, done, total: 34_375, ascensions: 7, queue });
    expect(left.chain).toEqual({ at: 1, of: 3 });
    expect(left.chainsTotal).toBe(132_192);
    expect(left.chainsLeft).toBe(132_192 - done);
    const units = 34_375 - done + 52_000 * relativeChainCost(6, 7) + 45_817 * relativeChainCost(5, 7);
    expect(left.seconds).toBeCloseTo(units / 2, 0);
    // Shorter chains cost less than this 7-ascension one, so the queue is under "all at this rate".
    expect(left.seconds!).toBeLessThan((132_192 - done) / 2);

    // Chain 2 running: chain 1's chains are done, and only chain 3 is still to come.
    const second = sweepTimeLeft({ samples, done, total: 52_000, ascensions: 6, queue: { ...queue, at: 1 } });
    expect(second.chain).toEqual({ at: 2, of: 3 });
    expect(second.chainsTotal).toBe(132_192);
    expect(second.chainsLeft).toBe(52_000 - done + 45_817);
  });

  it('a single run (a carry-on runs its own chain only) counts that chain alone', () => {
    const { samples, done } = priced(180, 2, 100);
    const left = sweepTimeLeft({ samples, done, total: 2601, ascensions: 3, queue: null });
    expect(left.chain).toBeNull();
    expect(left.chainsTotal).toBe(2601);
    expect(left.chainsLeft).toBe(2601 - done);
  });

  it('keeps the newest count when reports come close together (a chain takes seconds: reports are sparse)', () => {
    // Workers start cold: nothing for 50 s, then four chains a second apart. Dropping reports within
    // 5 s of the last kept one, the rate read 1 chain in 50 s ("about 34.5 h left", browser, 9 Oct).
    const t0 = 2_000_000;
    let samples = addChainSample([], t0, 0);
    for (let k = 1; k <= 4; k++) samples = addChainSample(samples, t0 + 50_000 + (k - 1) * 1000, k);
    expect(samples.at(-1)).toEqual([t0 + 53_000, 4]);
    const left = sweepTimeLeft({ samples, done: 4, total: 1004, ascensions: 3 });
    expect(left.seconds).toBeCloseTo(1000 / (4 / 53), 0);
    // Samples stay at least 5 s apart, bar the newest.
    for (let k = 5; k <= 40; k++) samples = addChainSample(samples, t0 + 50_000 + (k - 1) * 1000, k);
    const gaps = samples.slice(1, -1).map((x, i) => x[0] - samples[i][0]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5000);
    expect(samples.at(-1)).toEqual([t0 + 89_000, 40]);
  });

  it('says a time the same way on the bar and the panel', () => {
    expect(formatTimeLeft(40)).toBe('40 s');
    expect(formatTimeLeft(80 * 60)).toBe('80 min');
    expect(formatTimeLeft(4.2 * 3600)).toBe('4.2 h');
    expect(formatTimeLeft(3.1 * 86400)).toBe('3.1 days');
    expect(formatTimeLeft(0)).toBe('');
  });
});
