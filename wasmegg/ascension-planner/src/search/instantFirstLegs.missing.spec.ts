/**
 * A BUILD-UP THAT COULD NOT BE WORKED OUT MUST NOT TURN INTO "PRESTIGE NOW" (design spec, failing first; game expert,
 * 6 Nov 2026, Jordan's phone).
 *
 * egg-beta c8b5dc123, 7:50 pm save, Highest TE by Egg Day: "First step: prestige now and reach 220 TE (Jan 1, 2027 at
 * 2:11 AM)". Run headless on the same save, Continue my build-up to 220 lands Dec 27 7:38 AM and a fresh prestige lands
 * Jan 1 2:49 AM: the advice was 4 days 19 h worse, and the route's 314 became 311. The page asks a worker for the
 * build-up's tails (chainSearch.ts `buildUpTails`), which returns [] on ANY failure, silently, and keeps that for the
 * save, TE and plan start; `firstLegOptions` then has only the fresh and continue legs and picks the fresh one.
 *
 * Wanted: `instantFirstLegsBase` says when the setting builds up (auto or buildup), the save has a farm and working
 * the build-up out FAILED (`buildUpMissing`), so the page can say so instead of presenting a fresh prestige as the plan.
 * An empty build-up that did not fail (nothing left to buy) is right and is NOT flagged (orchestrator, 6 Nov 2026: the
 * card's words read the flag as "could not be worked out").
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';
import type { BuildParams } from './precomputedLeg';

vi.mock('./leg', () => ({
  continueTailParams: () => ({ sales: 0, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 5, delivered: [] }),
}));

import { instantFirstLegsBase } from './instantFirstLegs';

const tail: BuildParams = { sales: 2, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 9, delivered: [] };
const inputs = (over: Partial<SearchInputs> = {}): SearchInputs =>
  ({
    planStart: 1000,
    currentTE: 198,
    baseState: { eggsDelivered: {} },
    currentFarmState: {},
    ...over,
  }) as unknown as SearchInputs;
const params = (tails: BuildParams[], over = {}) => ({
  startTE: 198,
  final: 490,
  buildUpTails: vi.fn(async () => tails),
  ...over,
});
/** The store's answer when its worker failed (stores/chainSearch.ts `buildUpTails`). */
const failed = { tails: [] as BuildParams[], failed: true, reason: 'worker 0 (build-up tails) was lost' };

describe('instantFirstLegsBase: buildUpMissing', () => {
  it('is true when the setting builds up, the save has a farm and working the build-up out failed', async () => {
    for (const firstAscension of ['auto', 'buildup'] as const) {
      const p = { startTE: 198, final: 490, buildUpTails: vi.fn(async () => failed) };
      const base = (await instantFirstLegsBase(inputs({ firstAscension }), p)) as {
        buildUpMissing?: boolean;
        buildUp?: unknown;
      };
      expect(base.buildUpMissing).toBe(true);
      expect(base.buildUp).toEqual([]);
    }
  });
  it('is not true for an empty build-up that did not fail: nothing left to buy (control)', async () => {
    for (const r of [[], { tails: [] }] as unknown[]) {
      const p = { startTE: 198, final: 490, buildUpTails: vi.fn(async () => r as BuildParams[]) };
      const base = (await instantFirstLegsBase(inputs({ firstAscension: 'auto' }), p)) as { buildUpMissing?: boolean };
      expect(base.buildUpMissing).toBeFalsy();
    }
  });
  it('is not true when tails came back (control)', async () => {
    const base = (await instantFirstLegsBase(inputs({ firstAscension: 'auto' }), params([tail]))) as {
      buildUpMissing?: boolean;
    };
    expect(base.buildUpMissing).toBeFalsy();
  });
  it('is not true when the setting never builds up, there is no farm, or it was left out (control)', async () => {
    for (const [i, extra] of [
      [inputs({ firstAscension: 'fresh' }), {}],
      [inputs({ firstAscension: 'continue' }), {}],
      [inputs({ firstAscension: 'auto', currentFarmState: null }), {}],
      [inputs({ firstAscension: 'auto' }), { buildUp: false }],
    ] as const) {
      const base = (await instantFirstLegsBase(i, params([], extra))) as { buildUpMissing?: boolean };
      expect(base.buildUpMissing).toBeFalsy();
    }
  });
});
