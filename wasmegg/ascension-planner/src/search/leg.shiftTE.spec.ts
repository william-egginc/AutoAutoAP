/**
 * Each shift's TE (ShiftMoment.te, search/leg.ts `shiftInstants`) and each leg's end egg (LegSummary.endEgg),
 * on a real simulated leg of the synthetic save (src/test/syntheticSave.ts; no player data).
 *
 * What it proves:
 * - the number is the TE the egg being LEFT has at the shift, and keeps until the farm comes back to it:
 *   for every egg, its TE at its last shift off equals its TE when the route ends (endEggs, the same end
 *   state By a date's card reads), and the egg the leg ends on has the TE endEgg says;
 * - the shift's end state is the shift moment: a shift action changes only which egg is laid (engine
 *   apply 'shift'), so its end state still holds the left egg's eggs delivered;
 * - nothing the search scores moved: the route's seconds, the leg's start and end, its strategy, TE and
 *   every shift's moment and egg are the numbers recorded on this fixture BEFORE the change (15 Oct 2026).
 *
 * One leg (about a minute and a half of simulation), so the whole suite stays affordable.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { syntheticInputs } from '@/test/syntheticSave';
import { applyAction } from '@/engine/apply/actions';
import { createChainEvaluator } from './chain';
import { eggTE } from './leg';
import { VIRTUE_EGGS } from '@/types';
import type { ChainResult } from './types';

/** Recorded on this fixture before ShiftMoment.te existed: [at, egg switched to, egg left]. */
const BEFORE = {
  seconds: 20844400.35885477,
  startTime: 1790859600,
  endTime: 1811704000.3588548,
  durationSeconds: 20844400.358854692,
  key: '1-sale',
  endTE: 192,
  shifts: [
    [1790861349.4107058, 'kindness', 'curiosity'],
    [1790862865.0780554, 'integrity', 'kindness'],
    [1805159981.4405875, 'curiosity', 'integrity'],
    [1805159981.5070517, 'kindness', 'curiosity'],
    [1805160134.719131, 'resilience', 'kindness'],
    [1805160134.9371696, 'curiosity', 'resilience'],
    [1805160134.9371696, 'humility', 'curiosity'],
    [1805160134.9371696, 'kindness', 'humility'],
    [1808713719.6810021, 'integrity', 'kindness'],
  ] as [number, string, string][],
  endEggs: {
    delivered: [
      3282500000307806700, 3510000000064018400, 3282500000000000000, 3282500010416016000, 3510000000064018400,
    ],
    te: [38, 39, 38, 38, 39],
    egg: 'integrity',
  },
};

let route: ChainResult;
beforeAll(async () => {
  const inputs = await syntheticInputs();
  route = createChainEvaluator(inputs).evaluate([192])!;
}, 900_000);

describe('ShiftMoment.te on a simulated leg', () => {
  it("changes nothing the search scores: the route's numbers are the ones recorded before", () => {
    expect(route.seconds).toBe(BEFORE.seconds);
    const leg = route.legs[0];
    expect(leg.startTime).toBe(BEFORE.startTime);
    expect(leg.endTime).toBe(BEFORE.endTime);
    expect(leg.durationSeconds).toBe(BEFORE.durationSeconds);
    expect(leg.key).toBe(BEFORE.key);
    expect(leg.endTE).toBe(BEFORE.endTE);
    expect(leg.shifts!.map(s => [s.at, s.egg, s.fromEgg])).toEqual(BEFORE.shifts);
    expect(leg.endEggs).toEqual(BEFORE.endEggs);
  });

  it('every shift carries the TE of the egg it leaves', () => {
    const shifts = route.legs[0].shifts!;
    expect(shifts.length).toBeGreaterThan(0);
    for (const s of shifts) expect(Number.isInteger(s.te)).toBe(true);
  });

  it("an egg's TE at its last shift off is its TE when the route ends, and the end egg's is endEgg", () => {
    const leg = route.legs[0];
    const end = leg.endEggs!;
    const lastOff = new Map<string, number>();
    for (const s of leg.shifts!) lastOff.set(s.fromEgg!, s.te!);
    const endEgg = leg.endEgg!;
    expect(endEgg.egg).toBe(end.egg);
    VIRTUE_EGGS.forEach((egg, i) => {
      const atEnd = Math.max(end.te[i], 0);
      if (egg === endEgg.egg) expect(endEgg.te).toBe(atEnd);
      else if (lastOff.has(egg)) expect(lastOff.get(egg)).toBe(atEnd);
    });
    // The fixture moves off every egg but the one it ends on, and two of them gain a TE in the leg.
    expect(lastOff.size).toBe(5);
    expect(end.te.reduce((a, b) => a + b, 0)).toBe(192);
  });

  it("an egg's TE never goes down from one shift off it to the next", () => {
    const seen = new Map<string, number>();
    for (const s of route.legs[0].shifts!) {
      const before = seen.get(s.fromEgg!);
      if (before !== undefined) expect(s.te!).toBeGreaterThanOrEqual(before);
      seen.set(s.fromEgg!, s.te!);
    }
  });
});

describe("a shift's end state is the moment of the shift", () => {
  it('the engine applies a shift without touching eggs delivered or TE', () => {
    const state = {
      currentEgg: 'kindness',
      shiftCount: 3,
      soulEggs: 1e20,
      bankValue: 5,
      population: 100,
      eggsDelivered: { curiosity: 1, integrity: 2, humility: 3, resilience: 4, kindness: 5e15 },
      teEarned: { curiosity: 0, integrity: 0, humility: 0, resilience: 0, kindness: 12 },
    };
    const after = applyAction(
      state as never,
      {
        type: 'shift',
        payload: { fromEgg: 'kindness', toEgg: 'integrity', newShiftCount: 4 },
        cost: 1,
      } as never
    ) as unknown as typeof state;
    expect(after.currentEgg).toBe('integrity');
    expect(after.eggsDelivered).toEqual(state.eggsDelivered);
    expect(after.teEarned).toEqual(state.teEarned);
  });

  it('eggTE: the larger of the recorded TE and the thresholds passed; null without either', () => {
    expect(eggTE({ teEarned: { kindness: 12 }, eggsDelivered: { kindness: 0 } }, 'kindness')).toBe(12);
    expect(eggTE({ teEarned: {}, eggsDelivered: { kindness: 5e7 } }, 'kindness')).toBeGreaterThanOrEqual(1);
    expect(eggTE({}, 'kindness')).toBeNull();
    expect(eggTE(undefined, 'kindness')).toBeNull();
  });
});
