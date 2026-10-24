/**
 * A leg that never ends is a failed chain, not an Infinity.
 *
 * Found on a real save: a humility farm synced minutes into its ascension, run with force-continue,
 * priced leg 1 at 17 billion days and every later leg at Infinity. Kept as results, those chains
 * had no best, broke the chart, and made the CSV download throw. `runLeg` is mocked here because
 * the fault is in what the evaluator does with a leg, not in the simulator.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';

const endTimes = new Map<number, number>();

vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  runLeg: (_inputs: unknown, state: unknown, startTime: number, targetTE: number) => ({
    summary: {
      endTE: targetTE,
      endTime: endTimes.get(targetTE) ?? startTime + 86400,
      totalDurationSeconds: 86400,
      maxELR: 1,
      tier13Unlocked: false,
      startTime,
    },
    key: '1-sale',
    nextState: state,
    shifts: [],
  }),
}));

const { createChainEvaluator } = await import('./chain');

const inputs = { baseState: {}, planStart: 1_790_000_000, currentTE: 87, final: 490 } as unknown as SearchInputs;

describe('chain evaluator: legs that never end', () => {
  it('prices an ordinary chain', () => {
    endTimes.clear();
    const r = createChainEvaluator(inputs).evaluate([100, 490]);
    expect(r?.seconds).toBe(2 * 86400);
  });

  it.each([
    ['Infinity', Infinity],
    ['NaN', NaN],
    ['a date past what a Date can hold', 1.5e15],
  ])('rejects a chain whose leg ends at %s', (_label, end) => {
    endTimes.clear();
    endTimes.set(100, end);
    expect(createChainEvaluator(inputs).evaluate([100, 490])).toBeNull();
  });
});
