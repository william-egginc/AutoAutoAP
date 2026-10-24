import { beforeEach, describe, expect, it, vi } from 'vitest';

// Two synthetic legs: the first ends in the middle of the night, so the prestige waits for the
// player's 7:00. What the second leg is handed is what this file checks.
const calls: { state: { eggsDelivered: Record<string, number>; te: number }; te: number; start: number }[] = [];
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 4_102_444_800,
  runLeg: (_inputs: unknown, state: object, start: number, target: number, _c: boolean, te: number) => {
    calls.push({ state: JSON.parse(JSON.stringify(state)), te, start });
    const first = calls.length === 1;
    const end = first ? LEG1_END : start + 86_400;
    return {
      summary: {
        startTime: start,
        endTime: end,
        totalDurationSeconds: end - start,
        endTE: first ? 200 : target,
        maxELR: 1e12,
        tier13Unlocked: false,
        buildPhaseEndTime: start,
        buildPhaseSaleCount: 1,
      },
      key: '1-sale',
      nextState: { ...state, eggsDelivered: { humility: HUMILITY_AT_END }, teEarned: { humility: 0 }, te: 200 },
      shifts: [],
      heldSeconds: 0,
      lastEgg: 'humility',
    };
  },
}));

import { createChainEvaluator } from './chain';
import { countTEThresholdsPassed, getThresholdForTE } from '@/lib/truthEggs';
import type { SearchInputs } from './types';

// 1:00 am Denver on a January night (MST, UTC-7) and the player's 7:00 am: a six-hour wait.
const LEG1_END = Date.parse('2027-01-02T08:00:00Z') / 1000;
const HANDOFF = Date.parse('2027-01-02T14:00:00Z') / 1000;
const WAIT = HANDOFF - LEG1_END;
// Two hours of laying short of the next humility threshold, so the six-hour wait passes it.
const HUMILITY_AT_END = getThresholdForTE(40) - 1e12 * 7200;
const hours = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
const inputs = (over: Partial<SearchInputs>) =>
  ({
    baseState: { currentEgg: 'humility', eggsDelivered: {}, teEarned: {}, te: 190 },
    planStart: Date.parse('2026-10-01T15:00:00Z') / 1000,
    currentTE: 190,
    final: 490,
    timeOff: [],
    milestones: [],
    ...over,
  }) as unknown as SearchInputs;

describe('the wait to prestige credits the farm (the player is on it, asleep)', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('keeps laying the last egg until the handoff and hands the eggs and TE to the next leg', () => {
    const r = createChainEvaluator(inputs({ availability: hours, deferShifts: true })).evaluate([200, 490])!;
    expect(r.legs[0].sleepDelaySeconds).toBe(WAIT);
    expect(calls[1].start).toBe(HANDOFF);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * WAIT);
    // The threshold passed while waiting is counted in the next leg's start TE.
    const gained = countTEThresholdsPassed(HUMILITY_AT_END + 1e12 * WAIT) - countTEThresholdsPassed(HUMILITY_AT_END);
    expect(gained).toBe(1);
    expect(calls[1].te).toBe(calls[1].state.te);
  });

  it('changes nothing without hours: same start, same eggs, same TE', () => {
    const r = createChainEvaluator(inputs({ availability: null })).evaluate([200, 490])!;
    expect(r.legs[0].sleepDelaySeconds).toBe(0);
    expect(calls[1].start).toBe(LEG1_END);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END);
    expect(calls[1].te).toBe(200);
  });

  it('leaves the leg alone when it ends inside the hours', () => {
    const daytime = createChainEvaluator(
      inputs({ availability: { ...hours, fromHour: 0, toHour: 24 }, deferShifts: true })
    ).evaluate([200, 490])!;
    expect(daytime.legs[0].sleepDelaySeconds).toBe(0);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END);
  });
});
