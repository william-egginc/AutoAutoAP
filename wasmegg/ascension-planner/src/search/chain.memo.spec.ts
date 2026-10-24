/**
 * The prefix memo's settings (search/chain.ts `MemoSettings`): its capacity, and leaving out each
 * route's own last leg, which a By a date run never reads again.
 *
 * `runLeg` is a toy (one TE a day) that counts its calls, so what the memo saves is just the count.
 * The thrash case is the one a real 32,645-set run hit: every round comes back to each set's early
 * leg in the same order, and a memo that also holds the last legs is too small to keep them.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';

const DAY = 86400;

vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  runLeg: (_inputs: unknown, _state: unknown, start: number, target: number, _allow: boolean, te: number) => ({
    summary: {
      endTE: target,
      endTime: start + (target - te) * DAY,
      startTime: start,
      totalDurationSeconds: (target - te) * DAY,
      maxELR: 1,
      tier13Unlocked: false,
    },
    key: '1-sale',
    nextState: {},
    shifts: [],
  }),
}));

const { createChainEvaluator, DEFAULT_MEMO_CAPACITY } = await import('./chain');

const inputs = { baseState: {}, planStart: 1_800_000_000, currentTE: 100, final: 490 } as unknown as SearchInputs;

/** `rounds` rounds over `sets` one-early-stop sets, each round trying a new last stop for every set,
 *  in the same order every round. Legs simulated per route after the first round. */
function laterLegsPerRoute(
  ev: ReturnType<typeof createChainEvaluator>,
  sets: number,
  rounds: number,
  keepLast?: boolean
): number {
  const route = (s: number, r: number) => [101 + s, 1000 + r];
  for (let s = 0; s < sets; s++) ev.evaluate(route(s, 0), keepLast === undefined ? undefined : { keepLast });
  const before = ev.legSims;
  for (let r = 1; r <= rounds; r++)
    for (let s = 0; s < sets; s++) ev.evaluate(route(s, r), keepLast === undefined ? undefined : { keepLast });
  return (ev.legSims - before) / (sets * rounds);
}

describe('the prefix memo', () => {
  it('keeps every step by default, as Smart search and the Full sweep always had', () => {
    const ev = createChainEvaluator(inputs);
    expect(ev.memoCapacity).toBe(DEFAULT_MEMO_CAPACITY);
    ev.evaluate([120, 150]);
    expect(ev.legSims).toBe(2);
    expect(ev.memoSize).toBe(2);
    // The same chain again costs nothing: its last step was kept.
    ev.evaluate([120, 150]);
    expect(ev.legSims).toBe(2);
  });

  it("leaves out the route's own last leg when asked, and still shares the early ones", () => {
    const ev = createChainEvaluator(inputs, { keepLast: false });
    ev.evaluate([120, 150]);
    expect(ev.memoSize).toBe(1);
    ev.evaluate([120, 160]);
    expect(ev.legSims).toBe(3); // 120 once, then 150 and 160
    expect(ev.memoSize).toBe(1);
    // Per chain, overriding the evaluator's setting.
    ev.evaluate([120, 170], { keepLast: true });
    expect(ev.memoSize).toBe(2);
  });

  it('still reads a last step another route kept as its early stops', () => {
    const ev = createChainEvaluator(inputs, { keepLast: false });
    ev.evaluate([120, 150, 200]);
    const before = ev.legSims;
    // [120, 150] is the first route's early stops, held in the memo.
    ev.evaluate([120, 150], { keepLast: false });
    expect(ev.legSims).toBe(before);
  });

  it('gives the same answers whatever it keeps', () => {
    const a = createChainEvaluator(inputs);
    const b = createChainEvaluator(inputs, { keepLast: false, capacity: 2 });
    for (const c of [
      [120, 150],
      [120, 160],
      [130, 160, 200],
      [120, 150],
    ])
      expect(b.evaluate(c)).toEqual(a.evaluate(c));
  });

  it('thrashes when last legs crowd out the early ones, and holds once they are left out', () => {
    // 300 sets, room for 400 entries: with last legs kept a round writes 300 and reads 300, more than
    // fits, and least-recently-used drops each early leg just before it is read again.
    expect(laterLegsPerRoute(createChainEvaluator(inputs, { capacity: 400 }), 300, 3)).toBe(2);
    // Without them the 300 early legs fit, and a later route is its last leg alone.
    expect(laterLegsPerRoute(createChainEvaluator(inputs, { capacity: 400, keepLast: false }), 300, 3)).toBe(1);
    // A memo smaller than the early legs themselves is the same cliff, which is why it is sized for the run.
    expect(laterLegsPerRoute(createChainEvaluator(inputs, { capacity: 250, keepLast: false }), 300, 3)).toBe(2);
  });

  it('changes capacity mid-run, dropping the least recently used when it shrinks', () => {
    const ev = createChainEvaluator(inputs, { keepLast: false });
    for (let s = 0; s < 10; s++) ev.evaluate([101 + s, 200]);
    expect(ev.memoSize).toBe(10);
    ev.evaluate([101, 210]); // 101 is now the most recently used
    ev.setMemo({ capacity: 3 });
    expect(ev.memoCapacity).toBe(3);
    expect(ev.memoSize).toBe(3);
    const before = ev.legSims;
    ev.evaluate([101, 220]);
    expect(ev.legSims).toBe(before + 1); // kept
    ev.evaluate([102, 220]);
    expect(ev.legSims).toBe(before + 3); // dropped, simulated again
    ev.setMemo({ capacity: 0 }); // unusable: the default
    expect(ev.memoCapacity).toBe(DEFAULT_MEMO_CAPACITY);
  });
});
