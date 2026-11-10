/**
 * THE BUILD-UP'S BUYS INSIDE THE PLAYER'S HOURS, on Jordan's main (spec-awakebuys, 9 Nov 2026; first written 7 Nov as spec-buildup-hours): the save of Nov 7,
 * 2026, 12:22 am (scrubbed, read where it is, never copied), mid build-up, sale on until Sat 10:00 am.
 *
 * With Setup hours 7 am to 1 am (and "hold my shifts" on), the chain's build-up still has research bought between 1 am
 * and 7 am (Atomic Purification 42 at 1:15, Matter Reconfiguration 1:27 to 1:55, Eggsistor 51 at 2:40, ... Eggsistor 52
 * at 4:41, MR to 140 at 5:36). Only the prestige instants and the egg shifts are held to the hours (search/availability.ts
 * "WHAT IT DOES NOT MODEL", search/leg.ts legContext holdUntil, auto/hold.ts: shifts only), so the finish date counts
 * night buys nobody on those hours can make: from this save the finish is Tue Dec 29, 3:08 pm with the night buys and
 * 6:52 pm when the first buy is at 7:00 am (notes/ "Plan vs done, 6-7 Nov").
 *
 * This asserts what the hours should mean: no research purchase in the plan from 1:00 am to 7:00 am (the player is back at 7:00, inside the sale that runs to 10:00 am, so the buys are held to then, not past the sale). It FAILS before the hold (spec-awakebuys).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/search/buildUpHours.save.spec.ts
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
import { inputsForWorkers } from './workerBackup';
import { workerCopy } from './workerCopy';
import type { SearchInputs } from './types';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-07-0026.json');
const hasSave = existsSync(SAVE);
const NOW = Math.floor(Date.parse('2026-11-07T00:27:00-07:00') / 1000);
const ONE_AM = Math.floor(Date.parse('2026-11-07T01:00:00-07:00') / 1000);
const SEVEN_AM = Math.floor(Date.parse('2026-11-07T07:00:00-07:00') / 1000);

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Jordan's main, Nov 7 12:22 am: buys inside his hours", () => {
  let night: string[] = [];
  beforeAll(async () => {
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
    setActivePinia(createPinia());
    backup.eiUserId = 'EI0000000000000000';
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useChainSearchStore();
    store.setFirstAscension('buildup');
    store.pinPlanStart(NOW);
    const page = store.collectInputs();
    const inputs = {
      ...structuredClone(workerCopy(inputsForWorkers(page))),
      availability: { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 1, timezone: 'America/Denver' },
      deferShifts: true,
    } as unknown as SearchInputs;
    const route = createChainEvaluator(inputs).evaluate([221], { keepPurchases: true })!;
    const plan = buildUpPlanFromSegments(route.legs, { accountKey: 'a', siloSeconds: 0 })!;
    night = (plan.actions as unknown as { kind: string; t: number; label?: string }[])
      .filter(a => a.kind === 'research' && a.t >= ONE_AM && a.t < SEVEN_AM)
      .map(a => `${new Date(a.t * 1000).toISOString()} ${a.label}`);
  }, 600_000);
  afterAll(() => vi.useRealTimers());

  it('plans no research purchase between 1 am and 7 am when the hours are 7 am to 1 am', () => {
    expect(night).toEqual([]);
  });
});
