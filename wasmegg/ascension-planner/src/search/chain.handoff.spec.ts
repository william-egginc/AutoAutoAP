import { beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic legs: each lasts a day and a half, plus `offHourPenalty` when it starts off the hour
// (minus it when negative), so the tests can make either start the sooner one.
const starts: number[] = [];
let offHourPenalty = 7200;
let firstIsContinue = false;
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 4_102_444_800,
  runLeg: (_inputs: unknown, state: object, start: number, target: number, allowContinue: boolean, te: number) => {
    starts.push(start);
    const end = start + 129_600 + (start % 3600 === 0 ? 0 : offHourPenalty);
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
      key: allowContinue && firstIsContinue ? 'continue' : '1-sale',
      nextState: { ...state, te: target },
      shifts: [],
      heldSeconds: 0,
      lastEgg: 'humility',
      te,
    };
  },
}));

import { createChainEvaluator } from './chain';
import type { SearchInputs } from './types';

// Monday 4 Jan 2027, 9:30 am PST: the first leg ends Tuesday 9:30 pm, off the hour, no sale.
const PLAN_START = Date.parse('2027-01-04T17:30:00Z') / 1000;
const inputs = (planStart = PLAN_START) =>
  ({
    baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 190 },
    planStart,
    currentTE: 190,
    final: 490,
    timeOff: [],
    milestones: [],
    availability: null,
  }) as unknown as SearchInputs;
const nextHour = (t: number) => Math.ceil(t / 3600) * 3600;

describe('when each fresh ascension starts (HandoffChoice)', () => {
  beforeEach(() => {
    starts.length = 0;
    offHourPenalty = 7200;
    firstIsContinue = false;
  });

  it("'now' (the searches): every ascension starts the moment the last one ends", () => {
    const r = createChainEvaluator(inputs()).evaluate([200, 210])!;
    expect(starts).toEqual([PLAN_START, r.legs[0]!.endTime]);
  });

  it("'hour' (the exact check): a fresh ascension waits for the next whole hour, the first one too", () => {
    createChainEvaluator(inputs()).evaluate([200, 210], { handoff: 'hour' });
    // The first step is priced at once (it might continue), then fresh on the hour; the second on the hour.
    expect(starts[1]).toBe(nextHour(PLAN_START));
    expect(starts[2] % 3600).toBe(0);
    expect(starts).toHaveLength(3);
  });

  it("'sooner': both, keeping whichever ends sooner", () => {
    offHourPenalty = -7200; // starting at once is two hours faster here
    const r = createChainEvaluator(inputs()).evaluate([200, 210], { handoff: 'sooner' })!;
    expect(r.legs[0]!.startTime).toBe(PLAN_START);
    expect((r.legs[1]!.startTime ?? 0) % 3600).not.toBe(0);
    offHourPenalty = 7200; // and on the hour when that is faster
    const h = createChainEvaluator(inputs()).evaluate([200, 210], { handoff: 'sooner' })!;
    expect((h.legs[0]!.startTime ?? 0) % 3600).toBe(0);
    expect((h.legs[1]!.startTime ?? 0) % 3600).toBe(0);
  });

  it('continuing the ascension in progress starts at once, whatever the choice', () => {
    firstIsContinue = true;
    const r = createChainEvaluator(inputs()).evaluate([200, 210], { handoff: 'hour' })!;
    expect(r.legs[0]!.key).toBe('continue');
    expect(r.legs[0]!.startTime).toBe(PLAN_START);
  });

  it("'hour' also tries at once inside the weekly sale, as the table does", () => {
    offHourPenalty = -7200;
    // Thursday 7 Jan 2027 2:30 pm PST + 1.5 days = Saturday 2:30 am PST: inside the sale (Fri 9 am-Sat 9 am).
    const thursday = Date.parse('2027-01-07T22:30:00Z') / 1000;
    const r = createChainEvaluator(inputs(thursday)).evaluate([200, 210], { handoff: 'hour' })!;
    expect(r.legs[1]!.startTime).toBe(r.legs[0]!.endTime); // at once won, inside the sale
  });

  it("keeps 'now' on the plain prefix memo (the searches' cache is untouched)", () => {
    const ev = createChainEvaluator(inputs());
    ev.evaluate([200, 210]);
    const sims = ev.legSims;
    ev.evaluate([200, 210]);
    expect(ev.legSims).toBe(sims);
    ev.evaluate([200, 210], { handoff: 'hour' });
    expect(ev.legSims).toBeGreaterThan(sims);
  });
});
