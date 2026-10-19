import { beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic legs: each ends a day after it starts and reaches its target. What the next leg is handed
// after a planned wait is what this file checks (search/chain.ts `EvaluateChainOptions.delays`).
const calls: { state: { eggsDelivered: Record<string, number>; te: number }; te: number; start: number }[] = [];
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 4_102_444_800,
  runLeg: (_inputs: unknown, state: object, start: number, target: number, _c: boolean, te: number) => {
    calls.push({ state: JSON.parse(JSON.stringify(state)), te, start });
    const end = start + 86_400;
    return {
      summary: {
        startTime: start,
        endTime: end,
        totalDurationSeconds: end - start,
        endTE: target,
        maxELR: 1e12,
        tier13Unlocked: false,
        buildPhaseEndTime: start,
        buildPhaseSaleCount: 1,
      },
      key: '1-sale',
      nextState: { ...state, eggsDelivered: { humility: HUMILITY_AT_END }, teEarned: { humility: 39 }, te: target },
      shifts: [],
      heldSeconds: 0,
      lastEgg: 'humility',
    };
  },
}));

import { createChainEvaluator } from './chain';
import { getThresholdForTE } from '@/lib/truthEggs';
import type { SearchInputs } from './types';

const PLAN = Date.parse('2026-10-01T15:00:00Z') / 1000;
// Two hours of laying short of humility's 40th threshold.
const HUMILITY_AT_END = getThresholdForTE(40) - 1e12 * 7200;
const inputs = (over: Partial<SearchInputs> = {}) =>
  ({
    baseState: { currentEgg: 'humility', eggsDelivered: {}, teEarned: {}, te: 190 },
    planStart: PLAN,
    currentTE: 190,
    final: 490,
    timeOff: [],
    milestones: [],
    availability: null,
    ...over,
  }) as unknown as SearchInputs;

describe('a planned wait before a prestige', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('starts the next ascension after the wait, crediting the farm laying meanwhile', () => {
    const r = createChainEvaluator(inputs()).evaluate([200, 210, 490], { delays: [3 * 3600, 0] })!;
    expect(calls[1].start).toBe(PLAN + 86_400 + 3 * 3600);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * 3 * 3600);
    // Three hours of laying passes the threshold two hours away: humility 39 -> 40 into the next ascension.
    expect(calls[1].te).toBe(40);
    expect(calls[1].state.te).toBe(40);
    expect(r.legs[0].plannedWaitSeconds).toBe(3 * 3600);
    expect(r.legs[0].sleepDelaySeconds).toBe(0);
    expect(r.legs[1].plannedWaitSeconds).toBeUndefined();
    expect(r.seconds).toBe(3 * 86_400 + 3 * 3600);
  });

  it('prices exactly as before with no waits or all-zero waits', () => {
    const a = createChainEvaluator(inputs()).evaluate([200, 210, 490])!;
    const b = createChainEvaluator(inputs()).evaluate([200, 210, 490], { delays: [0, 0] })!;
    expect(b).toEqual(a);
  });

  it('never waits after the last stop', () => {
    const r = createChainEvaluator(inputs()).evaluate([200, 490], { delays: [0, 5 * 3600] })!;
    expect(r.seconds).toBe(2 * 86_400);
  });

  it('keeps routes with different waits apart in the memo, and shares what comes before the wait', () => {
    const ev = createChainEvaluator(inputs());
    ev.evaluate([200, 210, 490]);
    const before = ev.legSims;
    const r = ev.evaluate([200, 210, 490], { delays: [0, 2 * 3600] })!;
    // Leg 1 and leg 2 come from the memo; only the leg after the wait is simulated again.
    expect(ev.legSims - before).toBe(1);
    expect(r.seconds).toBe(3 * 86_400 + 2 * 3600);
  });

  it("waits for the player's hours after the planned wait", () => {
    // Leg 1 ends 9:00 am Denver (MDT); a 15-hour wait ends at midnight; awake 7 am to 11 pm.
    const hours = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
    const r = createChainEvaluator(inputs({ availability: hours })).evaluate([200, 490], { delays: [15 * 3600] })!;
    const end1 = PLAN + 86_400;
    const sevenAm = Date.parse('2026-10-03T13:00:00Z') / 1000;
    expect(calls[1].start).toBe(sevenAm);
    expect(r.legs[0].plannedWaitSeconds).toBe(15 * 3600);
    expect(r.legs[0].sleepDelaySeconds).toBe(sevenAm - end1 - 15 * 3600);
  });
});
