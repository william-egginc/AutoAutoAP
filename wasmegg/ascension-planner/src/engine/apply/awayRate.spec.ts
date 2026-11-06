/**
 * The 60 s rule as Jordan ruled it (3 Nov 2026): "Just have it wait a minute (only exception is when
 * it's instant, or 0s) then purchase the stuff then go offline a minute." No sub-minute waits: a buy
 * that has to wait at all waits at least a minute, away, so at the OFFLINE rate; an instant buy
 * (already affordable) stays 0 s. engine/apply/math.ts `getTimeToSave`, `MIN_WAIT_SECONDS`.
 * A farm laying 1,000 eggs/s, flat (no growth, no caps), $1,000/s online and $2,000/s offline.
 */
import { describe, expect, it } from 'vitest';
import type { CalculationsSnapshot } from '@/types';
import { calculateEarningsForTime, getTimeToSave, MIN_WAIT_SECONDS } from 'lib/planners/engine/apply/math';

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

describe('the 60 s rule: no sub-minute waits', () => {
  it('the minimum wait is a minute', () => {
    expect(MIN_WAIT_SECONDS).toBe(60);
  });
  it('a 13 s wait (offline) becomes 60 s', () => {
    expect(getTimeToSave(26_000, snap)).toBe(60);
  });
  it('an instant buy stays 0 s', () => {
    expect(getTimeToSave(5_000, { ...snap, bankValue: 10_000 } as CalculationsSnapshot)).toBe(0);
  });
  it('a wait of a minute or more is the offline time', () => {
    expect(getTimeToSave(300_000, snap)).toBeCloseTo(150);
  });
  it('waiting is paid at the offline rate, whatever its length', () => {
    expect(calculateEarningsForTime(60, snap)).toBeCloseTo(120_000);
    expect(calculateEarningsForTime(30, snap)).toBeCloseTo(60_000);
  });
});
