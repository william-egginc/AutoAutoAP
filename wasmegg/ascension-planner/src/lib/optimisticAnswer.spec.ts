import { describe, expect, it } from 'vitest';
import { OPTIMISTIC_SCALE, OPTIMISTIC_TEXT, optimisticForGear } from './optimisticAnswer';

// "May be optimistic for your gear": only the maxed answer scaled to a delivery rate under 95%.
describe('optimisticForGear', () => {
  it('the threshold is 0.95', () => {
    expect(OPTIMISTIC_SCALE).toBe(0.95);
  });
  it('the maxed answer at 0.94: shown; at 0.96: not', () => {
    expect(optimisticForGear('maxed', 0.94)).toBe(true);
    expect(optimisticForGear('maxed', 0.96)).toBe(false);
  });
  it('right at 0.95 and at full rate: not', () => {
    expect(optimisticForGear('maxed', 0.95)).toBe(false);
    expect(optimisticForGear('maxed', 1)).toBe(false);
  });
  it('far below (0.708, the weakest board run of 21 Oct): shown', () => {
    expect(optimisticForGear('maxed', 0.708)).toBe(true);
  });
  it('the player’s own answer or a gear combination’s: never, whatever the scale', () => {
    for (const scale of [0.5, 0.94, 0.96, 1]) {
      expect(optimisticForGear('own', scale)).toBe(false);
      expect(optimisticForGear('gear', scale)).toBe(false);
    }
  });
  it('no scale yet (the header not in): not', () => {
    expect(optimisticForGear('maxed', null)).toBe(false);
    expect(optimisticForGear('maxed', undefined)).toBe(false);
    expect(optimisticForGear('maxed', Number.NaN)).toBe(false);
  });
  it('the words', () => {
    expect(OPTIMISTIC_TEXT).toBe('This answer may be optimistic for your gear: Check exactly gives the real number.');
  });
});
