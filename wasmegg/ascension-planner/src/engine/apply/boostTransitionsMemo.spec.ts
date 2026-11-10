/**
 * boostTransitionsFrom's memo (sim4 table speed-up #3, 9 Nov 2026): the same lists as the walk
 * itself (`walkBoostTransitions`), whatever was asked before, and the same waits and earnings from
 * them, out past the 3-year horizon. A flat farm: $1,000/s online, $2,000/s offline, 2x boost.
 */
import { describe, expect, it } from 'vitest';
import type { CalculationsSnapshot } from '@/types';
import {
  boostTransitionsFrom,
  calculateEarningsForTime,
  getTimeToSave,
  walkBoostTransitions,
} from 'lib/planners/engine/apply/math';
import { getLocalTimestampInTimezone, PACIFIC_TIMEZONE } from 'lib/planners/events';

const snap = (active: boolean) =>
  ({
    population: 1000,
    offlineIHR: 0,
    ratePerChickenPerSecond: 1,
    shippingCapacity: 1e12,
    habCapacity: 1000,
    elr: 1000,
    onlineEarnings: 1000,
    offlineEarnings: 2000,
    bankValue: 0,
    earningsBoost: { active, multiplier: active ? 2 : 1 },
  }) as unknown as CalculationsSnapshot;

const JAN_2027 = getLocalTimestampInTimezone('2027-01-11', '00:00', PACIFIC_TIMEZONE);
/** A small seeded generator, so a failure names a time that can be rebuilt. */
function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}
const plain = (list: readonly { atSeconds: number; boostActive: boolean }[]) => list.map(t => ({ ...t }));

describe('boostTransitionsFrom memo', () => {
  it('gives the walk’s list for 3,000 times, both flags, asked twice in shuffled order', () => {
    const next = rng(11);
    // Hours, minutes and odd seconds from 2016 to 2040, plus the reference week's boost edges.
    const times = Array.from({ length: 3000 }, () => Math.floor(1.45e9 + next() * 7.5e8));
    for (let h = 0; h < 168; h++) times.push(JAN_2027 + h * 3600, JAN_2027 + h * 3600 - 1, JAN_2027 + h * 3600 + 1);
    for (const pass of [0, 1]) {
      for (let i = 0; i < times.length; i++) {
        const t = times[pass ? times.length - 1 - i : i];
        for (const active of [false, true]) {
          expect([t, active, plain(boostTransitionsFrom(snap(active), t))]).toEqual([
            t,
            active,
            walkBoostTransitions(snap(active), t),
          ]);
        }
      }
    }
  });

  it('is shared and frozen, so no caller can change it for the next one', () => {
    const a = boostTransitionsFrom(snap(false), JAN_2027 + 5);
    expect(boostTransitionsFrom(snap(false), JAN_2027 + 5)).toBe(a);
    expect(Object.isFrozen(a) && a.every(Object.isFrozen)).toBe(true);
    expect(boostTransitionsFrom(snap(true), JAN_2027 + 5)).not.toBe(a);
  });

  it('walks afresh for a short horizon or a flag that isn’t true/false', () => {
    const short = boostTransitionsFrom(snap(false), JAN_2027, 14 * 86400);
    expect(short).toEqual(walkBoostTransitions(snap(false), JAN_2027, 14 * 86400));
    expect(Object.isFrozen(short)).toBe(false);
    const odd = { ...snap(false), earningsBoost: { multiplier: 1 } } as unknown as CalculationsSnapshot;
    expect(boostTransitionsFrom(odd, JAN_2027)).toEqual(walkBoostTransitions(odd, JAN_2027));
  });

  it('long waits: the same time to save and earnings, from minutes to past the 3-year horizon', () => {
    const YEAR = 365 * 86400;
    for (const start of [JAN_2027, JAN_2027 + 3 * 86400 + 7777, JAN_2027 + 40 * YEAR]) {
      for (const active of [false, true]) {
        const s = snap(active);
        const memo = boostTransitionsFrom(s, start);
        const walk = walkBoostTransitions(s, start);
        for (const seconds of [61, 3600, 86400, 9 * 86400, 0.5 * YEAR, 2.9 * YEAR, 3.2 * YEAR, 5 * YEAR, 50 * YEAR]) {
          const cost = seconds * 2000;
          expect(getTimeToSave(cost, s, memo)).toBe(getTimeToSave(cost, s, walk));
          expect(calculateEarningsForTime(seconds, s, memo)).toBe(calculateEarningsForTime(seconds, s, walk));
        }
      }
    }
  });
});
