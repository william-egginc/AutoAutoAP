import { describe, expect, it } from 'vitest';
import { teByEggFor } from './teByEgg';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

// A 199-TE save: the game has claimed 40/40/40/40/39.
const eovEarned = [40, 40, 40, 40, 39];
const perEgg = (kindness: number) => ({ curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness });

describe('teByEggFor', () => {
  it("the planner's per-egg TE when it adds up", () => {
    expect(teByEggFor({ perEgg: perEgg(39), eovEarned, te: 199 })).toEqual(eovEarned);
  });

  it("pending TE taken in (Allan, 10 Oct): the planner's 200, not the save's claimed 199", () => {
    expect(teByEggFor({ perEgg: perEgg(40), eovEarned, te: 200 })).toEqual([40, 40, 40, 40, 40]);
  });

  it("else the save's claimed TE, else the thresholds its eggs delivered passed", () => {
    expect(teByEggFor({ perEgg: null, eovEarned, te: 199 })).toEqual(eovEarned);
    // Eggs delivered past 41 kindness thresholds: claimed 39 + 2 pending = 201.
    const delivered = [40, 40, 40, 40, 41].map(n => TE_BREAKPOINTS[n - 1]);
    expect(teByEggFor({ perEgg: perEgg(39), eovEarned, eggsDelivered: delivered, te: 201 })).toEqual([
      40, 40, 40, 40, 41,
    ]);
  });

  it('nothing rather than a wrong split when none adds up', () => {
    expect(teByEggFor({ perEgg: perEgg(39), eovEarned, eggsDelivered: [0, 0, 0, 0, 0], te: 205 })).toBeNull();
  });
});
