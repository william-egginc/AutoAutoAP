/**
 * The 60 s rule (game, Jordan 3 Nov 2026): away for less than a minute, online earnings apply;
 * offline earnings (online x away colleggtibles x the artifact away multiplier) only from a full
 * minute away. engine/apply/math.ts `earningsRateFor`, `getTimeToSave`, `calculateEarningsForTime`.
 * A farm laying 1,000 eggs/s, flat (no growth, no caps), $1,000/s online and $2,000/s offline.
 */
import { describe, expect, it } from 'vitest';
import type { CalculationsSnapshot } from '@/types';
import { calculateEarningsForTime, earningsRateFor, getTimeToSave, OFFLINE_AFTER_SECONDS } from './math';

const snap = {
  population: 1000,
  offlineIHR: 0,
  ratePerChickenPerSecond: 1,
  shippingCapacity: 1e12,
  habCapacity: 1000,
  elr: 1000,
  onlineEarnings: 1000,
  offlineEarnings: 2000,
  bankValue: 0,
  earningsBoost: { active: false, multiplier: 1 },
} as unknown as CalculationsSnapshot;

describe('the 60 s rule', () => {
  it('offline earnings start at a full minute away', () => {
    expect(OFFLINE_AFTER_SECONDS).toBe(60);
    expect(earningsRateFor(snap, 59.9)).toBe(1000);
    expect(earningsRateFor(snap, 60)).toBe(2000);
  });
  it('a wait under a minute earns the online rate', () => {
    expect(calculateEarningsForTime(30, snap)).toBeCloseTo(30_000);
    expect(calculateEarningsForTime(120, snap)).toBeCloseTo(240_000);
  });
  it('time to save: online when it is under a minute; offline from a minute on; a minute when only the offline rate gets there sooner', () => {
    expect(getTimeToSave(30_000, snap)).toBeCloseTo(30); // online 30 s
    expect(getTimeToSave(100_000, snap)).toBeCloseTo(60); // online 100 s, offline 50 s: affordable at 60 s
    expect(getTimeToSave(300_000, snap)).toBeCloseTo(150); // offline
  });
});
