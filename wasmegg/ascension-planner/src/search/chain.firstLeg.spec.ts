import { describe, expect, it, vi } from 'vitest';

// Leg 1's rival (the option it did not take) reaches the leg summary the CSV and the submission
// read. The leg is stubbed: only the leg that may continue simulated continue, and lost, so it alone
// carries a rival. It also ends a day later than a start on the hour would, so the hour wins.
const CONT_LATER = 19.2 * 3600;
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  runLeg: (_i: unknown, state: object, start: number, target: number, allowContinue: boolean) => {
    const end = start + (allowContinue ? 11 : 10) * 86400;
    return {
      summary: {
        startTime: start,
        endTime: end,
        totalDurationSeconds: end - start,
        endTE: target,
        maxELR: 1e12,
        tier13Unlocked: false,
        buildPhaseEndTime: start,
        buildPhaseSaleCount: 2,
      },
      key: '2-sale',
      nextState: state,
      shifts: [],
      heldSeconds: 0,
      lastEgg: 'curiosity',
      ...(allowContinue ? { rival: { key: 'continue', endTime: end + CONT_LATER } } : {}),
    };
  },
}));

import { createChainEvaluator } from './chain';
import type { SearchInputs } from './types';

// 1:47 pm Denver, not on the hour.
const START = Date.parse('2026-10-09T19:47:00Z') / 1000;
const inputs = {
  baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 141 },
  planStart: START,
  currentTE: 141,
  final: 490,
  timeOff: [],
  milestones: [],
  availability: null,
} as unknown as SearchInputs;

describe('leg 1 rival in the chain', () => {
  it('is on leg 1 only', () => {
    const r = createChainEvaluator(inputs).evaluate([161, 490])!;
    expect(r.legs[0].firstLegRival).toEqual({ key: 'continue', endTime: r.legs[0].endTime + CONT_LATER });
    expect(r.legs[1].firstLegRival).toBeUndefined();
  });

  it('a fresh start moved to the hour keeps the rival the start at once found', () => {
    const r = createChainEvaluator(inputs).evaluate([161, 490], { handoff: 'hour' })!;
    // Started on the hour (the stub's fresh-only leg), so continue was not simulated for it.
    expect(r.legs[0].startTime).toBe(Math.ceil(START / 3600) * 3600);
    expect(r.legs[0].firstLegRival?.key).toBe('continue');
  });
});
