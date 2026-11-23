/**
 * The Humility stop of the ascension the player is in, read off its simulated shifts (My runs' rockets row, Jordan 23 Nov
 * 2026: "put the optimizer in the ascent plan at the Humility stop"). v1: the current stop, or the next one to come, in
 * the ascension being followed; nothing for later ascensions (their fuel and farm are not known).
 */
import { describe, expect, it } from 'vitest';
import { humilityStopOf, stopDurationText } from './humilityStop';
import type { ActionLeg } from './nextAction';

const leg = (shifts: { at: number; egg: string }[], end = 90_000, o: Partial<ActionLeg> = {}): ActionLeg => ({
  to: 218,
  start: 0,
  end,
  shifts,
  simulated: true,
  ...o,
});
const SHIFTS = [
  { at: 1000, egg: 'curiosity' },
  { at: 20_000, egg: 'humility' },
  { at: 20_000 + 52 * 3600, egg: 'resilience' },
];

describe('humilityStopOf', () => {
  it('the next stop before it starts: its arrival and how long the plan stays', () => {
    expect(humilityStopOf(leg(SHIFTS, 400_000), 5000)).toEqual({ arrival: 20_000, end: 20_000 + 52 * 3600, lengthSeconds: 52 * 3600, current: false });
  });
  it('the current stop while the player is on it', () => {
    const s = humilityStopOf(leg(SHIFTS, 400_000), 30_000)!;
    expect(s.current).toBe(true);
    expect(s.arrival).toBe(20_000);
  });
  it('none once the plan has left Humility, or without simulated shifts', () => {
    expect(humilityStopOf(leg(SHIFTS, 400_000), 20_000 + 53 * 3600)).toBeNull();
    expect(humilityStopOf(leg(SHIFTS, 400_000, { simulated: false }), 5000)).toBeNull();
    expect(humilityStopOf(leg([{ at: 1000, egg: 'curiosity' }]), 5000)).toBeNull();
    expect(humilityStopOf(null, 5000)).toBeNull();
  });
  it('a stop with no shift after it lasts to the end of the ascension', () => {
    const s = humilityStopOf(leg([{ at: 20_000, egg: 'humility' }], 100_000), 5000)!;
    expect(s.end).toBe(100_000);
    expect(s.lengthSeconds).toBe(80_000);
  });
  it('the first stop that has not finished, when the plan visits Humility twice', () => {
    const twice = [
      { at: 10_000, egg: 'humility' },
      { at: 20_000, egg: 'resilience' },
      { at: 50_000, egg: 'humility' },
      { at: 60_000, egg: 'kindness' },
    ];
    expect(humilityStopOf(leg(twice, 90_000), 25_000)!.arrival).toBe(50_000);
    expect(humilityStopOf(leg(twice, 90_000), 15_000)!.arrival).toBe(10_000);
  });
});

describe('stopDurationText', () => {
  it('whole hours the duration field reads back, at least one', () => {
    expect(stopDurationText(52 * 3600)).toBe('52h');
    expect(stopDurationText(52 * 3600 + 1800)).toBe('52h');
    expect(stopDurationText(600)).toBe('1h');
    expect(stopDurationText(0)).toBe('');
  });
});
