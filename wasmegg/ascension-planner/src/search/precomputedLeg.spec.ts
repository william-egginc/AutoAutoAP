import { describe, expect, it } from 'vitest';
import { canonicalDelivered, sweepTails, tailTo, type BuildParams } from './precomputedLeg';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

/** A small seeded generator, so a failure can be reproduced. */
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('TE thresholds', () => {
  it('rise strictly, which the halving count relies on', () => {
    for (let i = 1; i < TE_BREAKPOINTS.length; i++) expect(TE_BREAKPOINTS[i]).toBeGreaterThan(TE_BREAKPOINTS[i - 1]);
  });
});

describe('sweepTails', () => {
  it('gives tailTo’s numbers exactly, at every checkpoint, from random builds', () => {
    const random = rng(12345);
    let compared = 0;
    for (let n = 0; n < 80; n++) {
      const te = 100 + Math.floor(random() * 385);
      const canon = canonicalDelivered(te);
      // Partial progress on some eggs, as a real build leaves it (up to most of the next TE).
      const delivered = canon.map((d, i) => {
        const next =
          TE_BREAKPOINTS[
            Math.min(
              TE_BREAKPOINTS.length - 1,
              TE_BREAKPOINTS.findIndex(b => b > d)
            )
          ];
        const r = random();
        // Mostly partway to the next TE; sometimes past it, as a build that earns a TE leaves it.
        return r < 0.5 ? d + (next - d) * random() * 0.9 : r < 0.7 ? next + (next - d) * 0.01 : d + i;
      });
      const waitStart = 50000 + random() * 900000;
      const b: BuildParams = {
        sales: 1 + Math.floor(random() * 3),
        tier13: random() < 0.3,
        waitStart,
        saleEnd: waitStart + (random() - 0.3) * 600000,
        peakELR: 1e12 + random() * 9e12,
        delivered,
      };
      const lateBy = random() < 0.5 ? 0 : Math.floor(random() * 3600);
      // From a few below the counts, as a route asks when a build earns TEs itself.
      const sweep = sweepTails(b, 490, lateBy, te - 3);
      for (let target = sweep.from; target <= sweep.to; target++) {
        const one = tailTo(b, target, lateBy);
        const i = target - sweep.from;
        if (!one) {
          expect(Number.isNaN(sweep.seconds[i])).toBe(true);
          continue;
        }
        expect(sweep.seconds[i]).toBe(one.seconds);
        expect(sweep.endTE[i]).toBe(one.endTE);
        const ends = [0, 0, 0, 0, 0];
        sweep.deliveredInto(i, ends);
        expect(ends).toEqual(one.delivered);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(5000);
    // tailTo, the reference, redoes the whole goal-sharing per checkpoint: that is the slow part.
  }, 120000);
});
