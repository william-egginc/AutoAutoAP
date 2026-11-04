/**
 * MY RUNS' A1 CHOICE (spec-a1choice, 1 Nov 2026; Jordan's decision via the orchestrator). Under My runs' unfinished-build
 * path (composables/useNowPage.ts: 'buildup' with continue left out) a build-up that buys still wins even when it ends
 * LATER than finishing without buying (pieha's 27 Oct decision). Right now now offers both. Both candidates come from
 * ONE simulation: runLeg already records when continue would have ended (`firstLegEnds.continue`), and now also how many
 * things the build-up's build buys (`buildUpBuys`), whichever kind won; the 'continue' side's own run carries the
 * build-up's end and buys the same way.
 *
 * Real simulations of synthetic saves (src/test/syntheticSave.ts; no player data, fixed clock):
 * - `oneCarShortBackup`: the alt's shape with the last hyperloop one car short. The build-up buys 1 thing and ends later
 *   than continue. Only with 'buildup' forced: My runs calls this farm built (its shipping is above its laying), so the
 *   page never offers the choice on it (spec-r7redteam-f; NowPage.a1Choice.realPage.spec.ts).
 * - `shippingShortBackup`: nine full hyperloops, shipping below laying at full habs, the page's unfinished build. The
 *   build-up buys 81 things and ends later than continue.
 * - `nothingToBuyBackup`: nothing to buy, no build-up, no count (spec-noemptybuild's state).
 * - the synthetic save as it is: its build-up buys and is sooner than continue.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import {
  nothingToBuyBackup,
  oneCarShortBackup,
  ONE_CAR_SHORT_SHAPE,
  shippingShortBackup,
  syntheticInputs,
} from '@/test/syntheticSave';
import { runLeg } from './leg';
import { CONTINUE_MAX_SECONDS } from './rules';
import type { SearchInputs } from './types';

const GOAL = 194;
const state = (inputs: SearchInputs) => JSON.parse(JSON.stringify(inputs.baseState));
const under = (base: SearchInputs, extra: Partial<SearchInputs>) => ({ ...base, ...extra }) as SearchInputs;
/** My runs' unfinished build (useNowPage `carryOn`), and the side "Finish without buying" asks for. */
const UNFINISHED = { firstAscension: 'buildup', continueMaxSeconds: 0 } as const;
const FINISH = { firstAscension: 'continue', continuePinSeconds: CONTINUE_MAX_SECONDS } as const;

describe('one train car short: a buying build-up that ends later than continue', () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await syntheticInputs(oneCarShortBackup);
  }, 600_000);

  it('the unfinished build takes the build-up, and its result carries both ends and the buy count (1)', () => {
    const r = runLeg(under(inputs, UNFINISHED), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('buildup');
    expect(r.buildUpBuys).toBe(1);
    expect(r.firstLegEnds?.buildup).toBe(r.summary.endTime);
    expect(r.firstLegEnds!.continue!).toBeLessThan(r.summary.endTime);
    // As measured: about 6.9 days against 6.4 (half a day later).
    expect((r.summary.endTime - r.firstLegEnds!.continue!) / 86400).toBeGreaterThan(0.3);
    void ONE_CAR_SHORT_SHAPE;
  }, 600_000);

  it("'Finish without buying' gives continue, and carries the build-up's end and buys too (one run is enough either way)", () => {
    const b = runLeg(under(inputs, UNFINISHED), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0)!;
    const r = runLeg(under(inputs, FINISH), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('continue');
    expect(r.buildUpBuys).toBe(1);
    expect(r.firstLegEnds?.continue).toBe(r.summary.endTime);
    expect(r.firstLegEnds?.buildup).toBe(b.summary.endTime);
    expect(r.summary.endTime).toBe(b.firstLegEnds!.continue);
  }, 600_000);
});

describe("shipping short of laying (the page's unfinished build): a buying build-up that ends later than continue", () => {
  it('the build-up buys 81 things and ends about 0.2 days after continue (6.90 d vs 6.69 d)', async () => {
    const inputs = await syntheticInputs(shippingShortBackup);
    const r = runLeg(under(inputs, UNFINISHED), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('buildup');
    expect(r.buildUpBuys).toBe(81);
    expect((r.summary.endTime - r.firstLegEnds!.continue!) / 86400).toBeGreaterThan(0.1);
  }, 600_000);
});

describe('no count where there is no build-up', () => {
  it('nothing to buy: continue, no build-up end, no buy count', async () => {
    const inputs = await syntheticInputs(() => nothingToBuyBackup(ONE_CAR_SHORT_SHAPE));
    const r = runLeg(under(inputs, UNFINISHED), state(inputs), inputs.planStart, GOAL, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('continue');
    expect(r.buildUpBuys).toBeUndefined();
    expect(r.firstLegEnds?.buildup).toBeUndefined();
  }, 600_000);

  it('the synthetic save as it is: the build-up buys (a count above 0) and is sooner than continue', async () => {
    const inputs = await syntheticInputs();
    const r = runLeg(under(inputs, UNFINISHED), state(inputs), inputs.planStart, 192, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('buildup');
    expect(r.buildUpBuys).toBeGreaterThan(0);
    expect(r.summary.endTime).toBeLessThan(r.firstLegEnds!.continue!);
  }, 600_000);
});
