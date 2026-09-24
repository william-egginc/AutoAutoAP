/**
 * Time off from the virtue farm, through the chain evaluator.
 *
 * The rule, as the players describe it: the ascension in progress ENDS when the time off begins
 * (keeping the TE it reached), nothing happens while away, and coming back is a complete rebuild --
 * a fresh ascension toward the same checkpoint, never a "continue". `runLeg` is replaced by a toy
 * where one TE takes one day and a build needs two days, so every expected instant is checkable by
 * hand.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs, TimeOffWindow } from './types';

const DAY = 86400;
const BUILD = 2 * DAY;
const calls: { start: number; target: number; allowContinue: boolean; endOverride?: number }[] = [];

vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  runLeg: (
    _inputs: unknown,
    _state: unknown,
    start: number,
    target: number,
    allowContinue: boolean,
    te: number,
    _idx: number,
    endOverride?: number
  ) => {
    calls.push({ start, target, allowContinue, endOverride });
    const summary = (end: number, endTE: number) => ({
      endTE,
      endTime: end,
      startTime: start,
      totalDurationSeconds: end - start,
      maxELR: 1,
      tier13Unlocked: false,
    });
    if (endOverride !== undefined) {
      if (endOverride - start < BUILD) return null; // the build cannot finish before the deadline
      return { summary: summary(endOverride, te + Math.floor((endOverride - start) / DAY)), key: '1-sale', nextState: {}, shifts: [] };
    }
    return { summary: summary(start + (target - te) * DAY, target), key: allowContinue ? 'continue' : '1-sale', nextState: {}, shifts: [] };
  },
}));

const { createChainEvaluator } = await import('./chain');

const at = (d: number) => 1_800_000_000 + d * DAY;
const evaluate = (chain: number[], timeOff: TimeOffWindow[] = []) => {
  calls.length = 0;
  const inputs = { baseState: {}, planStart: at(0), currentTE: 90, final: 490, timeOff } as unknown as SearchInputs;
  return createChainEvaluator(inputs).evaluate(chain);
};

describe('time off', () => {
  it('changes nothing when there is none', () => {
    const r = evaluate([100, 110])!;
    expect(r.seconds).toBe(20 * DAY);
    expect(r.legs.map(l => l.timeOff)).toEqual([undefined, undefined]);
  });

  it('ends the ascension when the time off starts, then rebuilds after it', () => {
    // Leg to 120 from 90 would take 30 days; three days off starting on day 10.
    const r = evaluate([120], [{ from: at(10), to: at(13) }])!;
    expect(r.legs.map(l => [l.timeOff, l.endTE])).toEqual([
      ['stopped', 100], // ten days in: 90 + 10
      ['restarted', 120],
    ]);
    expect(r.legs[1].startTime).toBe(at(13));
    expect(r.seconds).toBe(33 * DAY); // 10 days, 3 away, 20 to rebuild the rest
  });

  it('never continues after time off: the farm that was left is gone', () => {
    evaluate([120], [{ from: at(10), to: at(13) }]);
    const rebuild = calls.find(c => c.start === at(13))!;
    expect(rebuild.allowContinue).toBe(false);
    expect(calls[0].allowContinue).toBe(true); // before it, leg 1 could still continue
  });

  it('loses a build that cannot finish before the time off, and starts it again after', () => {
    // Off on day 1: a build needs two days, so nothing is kept from the first day.
    const r = evaluate([100], [{ from: at(1), to: at(4) }])!;
    expect(r.legs.map(l => l.timeOff)).toEqual(['restarted']);
    expect(r.seconds).toBe(14 * DAY); // back on day 4, then the full 10 days
  });

  it('starts after the time off when the plan itself starts inside it', () => {
    const r = evaluate([100], [{ from: at(-1), to: at(2) }])!;
    expect(r.legs[0].timeOff).toBe('restarted');
    expect(r.legs[0].startTime).toBe(at(2));
    expect(calls[0].allowContinue).toBe(false);
  });

  it('leaves a leg alone when the time off falls after it ends', () => {
    const r = evaluate([100, 110], [{ from: at(10), to: at(12) }])!;
    // Leg 1 ends on day 10 exactly as the time off starts; leg 2 starts inside it and waits.
    expect(r.legs.map(l => l.timeOff)).toEqual([undefined, 'restarted']);
    expect(r.seconds).toBe(22 * DAY);
  });
});
