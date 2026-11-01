/**
 * A FORCED BUILD-UP AGAINST A FRESH START (spec-r7verify, 1 Nov 2026; Release 7 verify item 3). "Continue my build-up"
 * forced (Your setup's choice, or My runs' unfinished build) never compares the ascension in progress with a fresh start:
 * search/leg.ts runLeg returns the build-up first. My runs now prices the fresh start lazily in a second simulation
 * (composables/useNowPage.ts `freshSim`: the same inputs as Prestige now) and says so on Right now when it ends more than
 * an hour sooner (lib/freshSooner.ts). Here the real simulator, exactly as the page asks it (search/chain.ts on a one-stop
 * route, a worker's plain copy of the inputs).
 *
 * The synthetic save as it is (src/test/syntheticSave.ts, no player data, fixed plan start Oct 1, 2026): a mid-build farm
 * on Curiosity (habs 12-13, five vehicles, a little research). To 192 TE, measured: the forced build-up (buys 1432 things)
 * 17.65 days, the fresh start 16.33 days (1-sale), about 32 hours sooner; Fastest picks the fresh start.
 */
import '../../scripts/node-shims';

import { appendFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from './chain';
import { workerCopy } from './workerCopy';
import { FRESH_SOONER_SECONDS, freshSooner } from '@/lib/freshSooner';
import type { SearchInputs } from './types';

const GOAL = 192;
/** My runs' unfinished build (useNowPage `carryOn`, lib/a1Choice.ts `a1Inputs('buildup')`). */
const UNFINISHED = { firstAscension: 'buildup', continueMaxSeconds: 0 } as const;

describe('a mid-build save, build-up forced, against the fresh start priced beside it', () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    inputs = await syntheticInputs();
  }, 600_000);
  const run = (extra: Partial<SearchInputs>) => {
    const t0 = Date.now();
    const legs = createChainEvaluator(workerCopy({ ...inputs, ...extra } as SearchInputs)).evaluate([GOAL])!.legs;
    return { leg: legs[legs.length - 1], ms: Date.now() - t0 };
  };

  it('the forced build-up ends over an hour (about 32 h) after the fresh start, which is what Fastest picks', () => {
    const forced = run(UNFINISHED);
    const fresh = run({ firstAscension: 'fresh' });
    const fastest = run({ firstAscension: 'auto' });
    // Opt-in timing record (AAP_FRESH_LOG=<file>): what the lazy pricing adds after Right now's answer.
    if (process.env.AAP_FRESH_LOG)
      appendFileSync(
        process.env.AAP_FRESH_LOG,
        `[leg.freshSooner] build-up ${((forced.leg.endTime - inputs.planStart) / 86400).toFixed(3)} d in ${forced.ms} ms; fresh ${((fresh.leg.endTime - inputs.planStart) / 86400).toFixed(3)} d in ${fresh.ms} ms; fastest ${String(fastest.leg.key)} in ${fastest.ms} ms\n`
      );
    expect(forced.leg.key).toBe('buildup');
    expect(String(fresh.leg.key)).toMatch(/-sale/);
    expect(forced.leg.endTime - fresh.leg.endTime).toBeGreaterThan(FRESH_SOONER_SECONDS);
    expect((forced.leg.endTime - fresh.leg.endTime) / 3600).toBeGreaterThan(24);
    // Right now's rule on these two ends (useNowPage `freshLine`).
    const f = freshSooner({ key: String(forced.leg.key), endTime: forced.leg.endTime, firstLegEnds: { fresh: fresh.leg.endTime } });
    expect(f?.seconds).toBe(forced.leg.endTime - fresh.leg.endTime);
    // Fastest agrees: it takes the fresh start, ending at the same instant.
    expect(String(fastest.leg.key)).toMatch(/-sale/);
    expect(fastest.leg.endTime).toBe(fresh.leg.endTime);
  }, 1_800_000);

  it("Your setup's Continue my build-up (no unfinished path) is the same build-up", () => {
    const leg = run({ firstAscension: 'buildup' }).leg;
    expect(leg.key).toBe('buildup');
    expect(leg.endTime - run({ firstAscension: 'fresh' }).leg.endTime).toBeGreaterThan(FRESH_SOONER_SECONDS);
  }, 1_800_000);
});
