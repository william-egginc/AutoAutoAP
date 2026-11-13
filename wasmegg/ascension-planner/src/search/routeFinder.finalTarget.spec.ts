import { describe, expect, it } from 'vitest';
import { canonicalDelivered, type BuildParams } from './precomputedLeg';
import { findRoutes, type BuildLookup } from './routeFinder';

// Target TE box (13 Nov 2026): the instant answer for a target below 490 is the same finder with
// `final` = N. These pin what that means, on a synthetic table, so nothing in src/search has to change.
const START = Date.UTC(2027, 0, 12, 12) / 1000;
const FROM = 300;
const TO = 340;

const build = (te: number, held = 0): BuildParams => ({
  sales: 1,
  tier13: false,
  waitStart: 3600,
  saleEnd: 7200,
  peakELR: 1e15,
  // `held`: the build ends holding the eggs of `held` more TEs than it started with.
  delivered: canonicalDelivered(te + held),
});
const tableOf =
  (held = 0): BuildLookup =>
  te =>
    te >= FROM && te <= TO ? [build(te, held)] : null;

describe('findRoutes with a target below 490', () => {
  for (const final of [310, 320, 335]) {
    it(`target ${final}: the route ends on ${final} exactly, every stop before it is lower and rising`, async () => {
      const { best } = await findRoutes({ table: tableOf(), startTE: FROM, start: START, final, maxAscensions: 6 });
      expect(best).not.toBeNull();
      const chain = best!.chain;
      expect(chain[chain.length - 1]).toBe(final);
      expect(best!.legs[best!.legs.length - 1].endTE).toBe(final);
      for (let i = 1; i < chain.length; i++) expect(chain[i]).toBeGreaterThan(chain[i - 1]);
      expect(chain[0]).toBeGreaterThan(FROM);
    });
  }

  it('a further target is never reached sooner than a nearer one', async () => {
    const ends: number[] = [];
    for (const final of [305, 315, 325, 335]) {
      const { best } = await findRoutes({ table: tableOf(), startTE: FROM, start: START, final, maxAscensions: 6 });
      ends.push(best!.seconds);
    }
    for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThanOrEqual(ends[i - 1]);
  });

  it('"best" is the fastest of the per-count answers', async () => {
    const { best, byAscensions } = await findRoutes({ table: tableOf(), startTE: FROM, start: START, final: 330, maxAscensions: 6 });
    const fastest = Math.min(...byAscensions.filter(Boolean).map(r => r!.seconds));
    expect(best!.seconds).toBe(fastest);
  });
});

describe('a target the first build already holds (documents today’s behaviour, 13 Nov 2026)', () => {
  // The build starts at TE 300 and ends holding the eggs of TE 308. A target of 303 was reached
  // part-way through the build, but the sweep only reaches a TE the build already holds once K3's
  // wait for the sale is over (precomputedLeg.ts sweepTails). So the answer is the build's whole
  // length, never less. Checked against the simulator (TE 200 to 205, 210, 220, maxed table): the
  // one-ascension answers match it to the second, so this is also what the simulator does. If a later
  // change prices an earlier moment, this fails on purpose: look at why before updating it.
  it('a target below what the build ends holding takes the whole build to the sale’s end', async () => {
    const { best } = await findRoutes({ table: tableOf(8), startTE: FROM, start: START, final: 303, maxAscensions: 1 });
    expect(best).not.toBeNull();
    const leg = best!.legs[0];
    expect(leg.endTE).toBeGreaterThanOrEqual(303);
    expect(leg.end - leg.start).toBe(7200);
  });

  it('a target of the build’s own end TE takes just as long', async () => {
    const near = await findRoutes({ table: tableOf(8), startTE: FROM, start: START, final: 301, maxAscensions: 1 });
    const own = await findRoutes({ table: tableOf(8), startTE: FROM, start: START, final: 308, maxAscensions: 1 });
    expect(near.best!.legs[0].end - near.best!.legs[0].start).toBe(own.best!.legs[0].end - own.best!.legs[0].start);
  });
});
