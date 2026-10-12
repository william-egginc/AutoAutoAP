import { describe, expect, it } from 'vitest';
import { CAGE_COOLDOWN_MS, CAGE_MB, cageNotch, cageStep, csvSoFarRoom, pastCage } from './cageGuard';

describe('the cage guard (12 Oct: 19 workers filled the 4 GB cage)', () => {
  const high = 0.85 * CAGE_MB;
  const low = 0.5 * CAGE_MB;

  it('takes about a sixth of the workers off a notch, never below one', () => {
    expect(cageNotch(19)).toBe(16);
    expect(cageNotch(16)).toBe(13);
    expect(cageNotch(4)).toBe(3);
    expect(cageNotch(1)).toBe(1);
  });

  it('steps down only on two high measurements running, outside the cooldown', () => {
    const now = 10 * CAGE_COOLDOWN_MS;
    expect(cageStep({ recent: [high, high], workers: 19, lastStepAt: 0, now })).toEqual({ to: 16 });
    expect(cageStep({ recent: [high], workers: 19, lastStepAt: 0, now })).toBeNull();
    expect(cageStep({ recent: [high, low], workers: 19, lastStepAt: 0, now })).toBeNull();
    expect(cageStep({ recent: [high, high], workers: 19, lastStepAt: now - 1000, now })).toBeNull();
    expect(cageStep({ recent: [high, high], workers: 1, lastStepAt: 0, now })).toBeNull();
  });

  it('does nothing where the page cannot be measured', () => {
    expect(pastCage(undefined, 0.1)).toBe(false);
    expect(pastCage(NaN, 0.1)).toBe(false);
    expect(csvSoFarRoom(undefined)).toBe(true);
  });

  it('holds the CSV so far back when the page is near the cage', () => {
    expect(csvSoFarRoom(low)).toBe(true);
    expect(csvSoFarRoom(0.75 * CAGE_MB)).toBe(false);
  });
});
