/** A route's last leg carries the end state per egg (LegSummary.endEggs), for By a date's TE per egg. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 4_102_444_800,
  runLeg: (_inputs: unknown, state: object, start: number, target: number) => ({
    summary: {
      startTime: start,
      endTime: start + 86_400,
      totalDurationSeconds: 86_400,
      endTE: target,
      maxELR: 1e12,
      tier13Unlocked: false,
      buildPhaseEndTime: start,
      buildPhaseSaleCount: 1,
      // Each leg's own numbers, so the test can tell which leg's state the route keeps.
      eggsDelivered: { curiosity: target * 1e16, integrity: 1, humility: 2, resilience: 3, kindness: 4 },
      finalTE: { curiosity: target - 4, integrity: 1, humility: 1, resilience: 1, kindness: 1 },
    },
    key: '1-sale',
    nextState: { ...state, te: target },
    shifts: [],
    heldSeconds: 0,
    lastEgg: 'integrity',
  }),
}));

import { createChainEvaluator } from './chain';
import type { SearchInputs } from './types';

const inputs = {
  baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 190 },
  planStart: Date.parse('2027-01-04T17:00:00Z') / 1000,
  currentTE: 190,
  final: 490,
  timeOff: [],
  milestones: [],
  availability: null,
} as unknown as SearchInputs;

describe('LegSummary.endEggs', () => {
  it('is on the last leg only, in VIRTUE_EGGS order, with the egg the farm is on', () => {
    const r = createChainEvaluator(inputs).evaluate([200, 210])!;
    expect(r.legs[0].endEggs).toBeUndefined();
    expect(r.legs[1].endEggs).toEqual({
      delivered: [210e16, 1, 2, 3, 4],
      te: [206, 1, 1, 1, 1],
      egg: 'integrity',
    });
  });
});
