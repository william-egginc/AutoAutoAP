/**
 * A FARM PART-WAY THROUGH C3 IS NOT SENT BACK THROUGH K2 (spec-midc3, 9 Nov 2026). A tester (about 200 TE, maximum earning
 * artifacts, a couple of days into C3, on Curiosity, following the instant answer) is told by "Continue my build-up":
 * buy Graviton Coupling 3 now, shift to Kindness, buy the extra train cars, shift back to Curiosity. "Buy gc3 now and
 * shift to kindness and buy all the extra cars and shift back."
 *
 * Cause (auto/buildUp.ts runBuildUpUntilC3, called from search/leg.ts buildUpBuild): the steps before C3 buy toward a
 * target, not a stage. C2's in-place part buys Graviton Coupling 3 on Curiosity; that lengthens every train, so K2's
 * in-place probe finds cars to buy; the farm is not on Kindness, so K2 shifts there (shift number paid in soul eggs),
 * buys the cars, and C3 shifts back. Joo's rule for continuing a build-up (Discord, pinned): on Curiosity with Autonomous
 * Vehicles finished and all 17 vehicles bought, the build is in C3: plan from the start of C3.
 *
 * Shaped like the tester's farm from Jordan's main (scrubbed save, Nov 7, 2026, 8:42 am, 197 TE, Curiosity, 17 hyperloops
 * of 8 cars, Graviton Coupling 3), with Graviton Coupling put back to 2 and every train to 7 cars in memory: vehicles all
 * bought, the train length one short of what Graviton Coupling 3 allows. No real ID is read or printed.
 *
 * Asserts the plan's first shift is H1 (Humility): no K2 shift, no C3 shift and no train-car purchase before it. FAILS today
 * (shifts K2 and C3, 17 train cars).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/search/buildUp.midC3.save.spec.ts
 * Another copy of the save: MAIN_SAVE=/path/to/save.json.
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { buildUpPlanFromSegments } from '@/lib/followSim';
import { createChainEvaluator } from './chain';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-07-0842.json');
const hasSave = existsSync(SAVE);
const NOW = Math.floor(Date.parse('2026-11-07T08:50:00-07:00') / 1000);

type Act = { kind: string; label?: string; id?: string; fromLevel?: number; level?: number };

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)(
  'a farm part-way through C3 (vehicles all bought, Curiosity)',
  () => {
    let beforeH1: Act[] = [];
    beforeAll(async () => {
      const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
      const farm = backup.farms[0];
      for (const r of farm.commonResearch) if (r.id === 'micro_coupling') r.level = 2;
      farm.trainLength = farm.trainLength.map(() => 7);
      vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
      setActivePinia(createPinia());
      backup.eiUserId = 'EI0000000000000000';
      resolveColleggtibleContracts(backup);
      await initPlanFuture('file', markRaw(backup));
      const store = useChainSearchStore();
      store.setFirstAscension('buildup');
      store.pinPlanStart(NOW);
      const route = createChainEvaluator(store.collectInputs()).evaluate([221], { keepPurchases: true })!;
      const plan = buildUpPlanFromSegments(route.legs, { accountKey: 'a', siloSeconds: 0 })!;
      const acts = plan.actions as unknown as Act[];
      const h1 = acts.findIndex(a => a.kind === 'shift' && a.label === 'H1');
      beforeH1 = acts.slice(0, h1 < 0 ? acts.length : h1);
    }, 600_000);
    afterAll(() => vi.useRealTimers());

    it('is not sent to Kindness and back: no K2 or C3 shift, no train cars before H1', () => {
      expect(beforeH1.filter(a => a.kind === 'shift').map(a => a.label)).toEqual([]);
      expect(beforeH1.filter(a => a.kind === 'trainCar')).toHaveLength(0);
    });
  }
);
