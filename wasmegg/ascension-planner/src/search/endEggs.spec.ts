/** TE per egg at the end of a route and each egg's next TE (search/endEggs.ts). */
import { describe, expect, it } from 'vitest';
import { endEggsOf } from './endEggs';
import type { LegSummary } from './types';

const END = 1_815_000_000;
// 50 + 50 + 49 + 49 + 49 = 247. TE 50 is passed at 7.03e18 and TE 51 at 7.41e18; TE 49 at 6.66e18, 50 at 7.03e18.
const endEggs = {
  delivered: [7.1e18, 7.2e18, 6.9e18, 6.7e18, 6.8e18],
  te: [50, 50, 49, 49, 49],
  egg: 'kindness',
};
const lastLeg = (over: Partial<LegSummary> = {}): LegSummary =>
  ({
    key: '1-sale',
    endTE: 247,
    endTime: END,
    durationSeconds: 40 * 86400,
    maxELR: 1e12,
    tier13Unlocked: true,
    endEggs,
    ...over,
  }) as LegSummary;
const route = (leg: LegSummary | null, chain = [166, 197, 247]) => ({
  chain,
  legs: leg ? [{ key: '1-sale', endTE: 166 } as LegSummary, { key: '1-sale', endTE: 197 } as LegSummary, leg] : [],
});

describe('endEggsOf', () => {
  it('each egg: its TE, the eggs to its next TE, and how long at the final rate', () => {
    const r = endEggsOf(route(lastLeg()))!;
    expect(r.rows.map(x => [x.egg, x.te])).toEqual([
      ['curiosity', 50],
      ['integrity', 50],
      ['humility', 49],
      ['resilience', 49],
      ['kindness', 49],
    ]);
    // Curiosity: 7.41e18 - 7.1e18 = 3.1e17 eggs, but no time: the farm is on kindness, and another egg
    // needs a shift, which starts the farm again from one chicken (15 Oct 2026, Halceyx).
    expect(r.rows[0].need).toBeCloseTo(3.1e17, -14);
    expect(r.rows[0].seconds).toBeNull();
    // Kindness: 7.03e18 - 6.8e18 = 2.3e17 at 1e12 a second.
    expect(r.rows[4].seconds).toBeCloseTo(2.3e5, -1);
    expect(r.rows.find(x => x.laying)?.egg).toBe('kindness');
    expect(r.rate).toBe(1e12);
  });

  it('the next TE: the egg being laid, never a part-filled egg the farm would have to shift to', () => {
    const r = endEggsOf(route(lastLeg()))!;
    // Humility is nearest (1.3e17 eggs) but the farm is on kindness (2.3e17): 2.3e5 s after the end.
    expect(r.next?.egg).toBe('kindness');
    expect(r.next!.at - END).toBeCloseTo(2.3e5, -1);
    // Not known which egg the farm is on: no next TE rather than a guess.
    expect(endEggsOf(route(lastLeg({ endEggs: { ...endEggs, egg: undefined as never } })))!.next).toBeNull();
  });

  it("the laid egg's next TE as a moment: the route's end plus its time at the final rate (16 Oct)", () => {
    const r = endEggsOf(route(lastLeg()))!;
    expect(r.rows[4].at! - END).toBeCloseTo(2.3e5, -1);
    expect(r.rows.filter(x => !x.laying).every(x => x.at === null)).toBe(true);
    expect(r.next!.at).toBe(r.rows[4].at);
    // No end time: the eggs and the time it would take, but no moment.
    const noEnd = endEggsOf(route(lastLeg({ endTime: undefined as never })))!;
    expect(noEnd.rows[4].seconds).toBeCloseTo(2.3e5, -1);
    expect(noEnd.rows.every(x => x.at === null)).toBe(true);
    expect(noEnd.next).toBeNull();
  });

  it('an egg with every TE has no next one', () => {
    const maxed = { delivered: [3.7e19, 0, 0, 0, 0], te: [98, 0, 0, 0, 0], egg: 'curiosity' };
    const r = endEggsOf(route(lastLeg({ endEggs: maxed }), [98]))!;
    expect(r.rows[0]).toMatchObject({ te: 98, need: null, seconds: null, at: null });
    // The farm is on curiosity, which has every TE: no next one by laying on.
    expect(r.next).toBeNull();
  });

  it('no rate: the TE and eggs needed, no times', () => {
    const r = endEggsOf(route(lastLeg({ maxELR: 0 })))!;
    expect(r.rate).toBeNull();
    expect(r.rows.every(x => x.seconds === null && x.at === null)).toBe(true);
    expect(r.next).toBeNull();
    expect(r.rows[0].need).toBeGreaterThan(0);
  });

  it('nothing rather than a guess', () => {
    expect(endEggsOf(null)).toBeNull();
    expect(endEggsOf(route(null))).toBeNull();
    // A leg read back from a checkpoint, or from before 11 Oct, has no end state.
    expect(endEggsOf(route(lastLeg({ endEggs: undefined })))).toBeNull();
    expect(endEggsOf(route(lastLeg({ replayed: true })))).toBeNull();
    // Per-egg TE that does not add up to the last stop.
    expect(endEggsOf(route(lastLeg(), [166, 197, 248]))).toBeNull();
    expect(endEggsOf(route(lastLeg({ endEggs: { ...endEggs, delivered: [1, 2, 3] } })))).toBeNull();
    expect(endEggsOf(route(lastLeg({ endEggs: { ...endEggs, te: [50, 50, 49, 49, NaN] } })))).toBeNull();
  });

  it('counts thresholds passed but not claimed, as Your plan does', () => {
    // Curiosity's eggs have passed TE 51 (7.41e18) while 50 is recorded: 51 it is, and the sum then
    // has to be 248.
    const e = { ...endEggs, delivered: [7.5e18, 7.2e18, 6.9e18, 6.7e18, 6.8e18] };
    expect(endEggsOf(route(lastLeg({ endEggs: e })))).toBeNull();
    expect(endEggsOf(route(lastLeg({ endEggs: e }), [166, 197, 248]))?.rows[0].te).toBe(51);
  });
});
