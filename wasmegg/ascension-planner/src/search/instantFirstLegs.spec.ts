import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';
import type { BuildParams } from './precomputedLeg';

vi.mock('./leg', () => ({
  continueTailParams: () => ({ sales: 0, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 5, delivered: [] }),
}));

import { instantFirstLegsBase } from './instantFirstLegs';

const tail: BuildParams = { sales: 2, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 9, delivered: [] };

function inputs(over: Partial<SearchInputs> = {}): SearchInputs {
  return {
    planStart: 1000,
    currentTE: 100,
    baseState: { eggsDelivered: {} },
    currentFarmState: {},
    ...over,
  } as unknown as SearchInputs;
}

describe('instantFirstLegsBase', () => {
  const params = (over = {}) => ({ startTE: 100, final: 490, buildUpTails: vi.fn(async () => [tail]), ...over });

  it("auto and buildup with a farm pass the build-up's legs", async () => {
    for (const firstAscension of ['auto', 'buildup'] as const) {
      const p = params();
      const base = await instantFirstLegsBase(inputs({ firstAscension }), p);
      expect(p.buildUpTails).toHaveBeenCalledWith(1000);
      expect(base.buildUp).toEqual([tail]);
      expect(base.cont?.peakELR).toBe(5);
      expect(base.firstAscension).toBe(firstAscension);
    }
  });

  it('continue and fresh never simulate it', async () => {
    for (const firstAscension of ['continue', 'fresh'] as const) {
      const p = params();
      const base = await instantFirstLegsBase(inputs({ firstAscension }), p);
      expect(p.buildUpTails).not.toHaveBeenCalled();
      expect(base.buildUp).toEqual([]);
    }
  });

  it('has none without a farm, for a canonical start, or when asked to leave it out', async () => {
    for (const [i, extra] of [
      [inputs({ currentFarmState: null }), {}],
      [inputs(), { save: false }],
      [inputs(), { buildUp: false }],
    ] as const) {
      const p = params(extra);
      const base = await instantFirstLegsBase(i, p);
      expect(p.buildUpTails).not.toHaveBeenCalled();
      expect(base.buildUp).toEqual([]);
    }
  });

  it('takes the start and eggs given, else the save', async () => {
    const base = await instantFirstLegsBase(inputs(), params({ start: 5000, delivered: [1, 2], save: false }));
    expect(base.start).toBe(5000);
    expect(base.delivered).toEqual([1, 2]);
    expect(base.cont).toBeNull();
  });
});
