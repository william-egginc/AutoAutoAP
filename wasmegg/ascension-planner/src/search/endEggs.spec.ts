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
    // Curiosity: 7.41e18 - 7.1e18 = 3.1e17 eggs, at 1e12 a second.
    expect(r.rows[0].need).toBeCloseTo(3.1e17, -14);
    expect(r.rows[0].seconds).toBeCloseTo(3.1e5, -1);
    expect(r.rows.find(x => x.laying)?.egg).toBe('kindness');
    expect(r.rate).toBe(1e12);
  });

  it('the next TE: the soonest egg, from when the last stop is reached', () => {
    const r = endEggsOf(route(lastLeg()))!;
    // Humility needs 7.03e18 - 6.9e18 = 1.3e17 (the least), so 1.3e5 s after the end.
    expect(r.next?.egg).toBe('humility');
    expect(r.next!.at - END).toBeCloseTo(1.3e5, -1);
  });

  it("each egg's next TE as a moment: the route's end plus its time at the final rate (16 Oct)", () => {
    const r = endEggsOf(route(lastLeg()))!;
    expect(r.rows[0].at! - END).toBeCloseTo(3.1e5, -1);
    for (const x of r.rows) expect(x.at).toBe(END + x.seconds!);
    expect(r.next!.at).toBe(Math.min(...r.rows.map(x => x.at!)));
    // No end time: the eggs and the time it would take, but no moment.
    const noEnd = endEggsOf(route(lastLeg({ endTime: undefined as never })))!;
    expect(noEnd.rows[0].seconds).toBeCloseTo(3.1e5, -1);
    expect(noEnd.rows.every(x => x.at === null)).toBe(true);
    expect(noEnd.next).toBeNull();
  });

  it('an egg with every TE has no next one', () => {
    const maxed = { delivered: [3.7e19, 0, 0, 0, 0], te: [98, 0, 0, 0, 0], egg: 'curiosity' };
    const r = endEggsOf(route(lastLeg({ endEggs: maxed }), [98]))!;
    expect(r.rows[0]).toMatchObject({ te: 98, need: null, seconds: null, at: null });
    // TE 1 on integrity is 5e7 eggs away.
    expect(r.next?.egg).toBe('integrity');
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
