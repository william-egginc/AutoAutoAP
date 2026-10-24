import { describe, expect, it } from 'vitest';
import { OPTIMISTIC_SCALE, OPTIMISTIC_TEXT, gearReadsMaxed, optimisticForGear } from './optimisticAnswer';

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
  it('a gear combination’s answer starting above its own rows reads the maxed one scaled: the same rule', () => {
    expect(optimisticForGear('gear', 0.94, true)).toBe(true);
    expect(optimisticForGear('gear', 0.96, true)).toBe(false);
    expect(optimisticForGear('own', 0.94, true)).toBe(false);
  });
  it('gearReadsMaxed: above the gear table’s own rows (340 and up by default)', () => {
    expect(gearReadsMaxed(339, 339)).toBe(false);
    expect(gearReadsMaxed(340, 339)).toBe(true);
    expect(gearReadsMaxed(345.6, undefined)).toBe(true);
    expect(gearReadsMaxed(338, null)).toBe(false);
    // A gear table that reaches higher keeps its own rows to there.
    expect(gearReadsMaxed(350, 360)).toBe(false);
    expect(gearReadsMaxed(361, 360)).toBe(true);
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
