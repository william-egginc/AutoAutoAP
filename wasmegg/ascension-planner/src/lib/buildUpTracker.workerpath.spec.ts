/**
 * THE BUILD-UP TRACKER'S PLAN, AS A WORKER WORKS IT OUT, on Jordan's main (spec-workervirtue, 7 Nov 2026): the save of
 * Nov 7, 2026, 8:51 am (scrubbed, read where it is, never copied), 197 TE claimed + 1 pending, mid build-up, sale on
 * until 10:00 am.
 *
 * The workers' trimmed save (search/workerBackup.ts) dropped the save's `virtue` block, so every worker read the farm's
 * claimed TE as 0. The tracker's plan then came back as 9:13 am "buy Timeline Diversion (46 → 47), shift to Humility,
 * set swap: equip the ELR set" (one check-in) instead of Egg 53 at 9:34, MR 143 at 9:56 and the Nov 13 buys: a shift
 * before the sale ended, and the sale buys gone. This builds the plan on exactly what the pool sends a worker
 * (`structuredClone(workerCopy(inputsForWorkers(inputs)))`) and checks the first lines.
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/lib/buildUpTracker.workerpath.spec.ts
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
import { createChainEvaluator } from '@/search/chain';
import { inputsForWorkers } from '@/search/workerBackup';
import { workerCopy } from '@/search/workerCopy';
import { buildUpPlanFromSegments } from './followSim';
import { buildUpTracker, lineText } from './buildUpTracker';
import type { SearchInputs } from '@/search/types';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-07-0853.json');
const hasSave = existsSync(SAVE);
const NOW = Math.floor(Date.parse('2026-11-07T09:13:00-07:00') / 1000);

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)(
  "Jordan's main, Nov 7 8:51 am: a worker's tracker plan",
  () => {
    let lines: ReturnType<typeof buildUpTracker>['lines'] = [];
    let actions: { kind: string; t: number }[] = [];
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
      const worker = structuredClone(workerCopy(inputsForWorkers(page))) as SearchInputs;
      const route = createChainEvaluator(worker).evaluate([221], { keepPurchases: true })!;
      const plan = buildUpPlanFromSegments(route.legs, { accountKey: 'a', siloSeconds: 0 })!;
      actions = plan.actions as unknown as { kind: string; t: number }[];
      lines = buildUpTracker({
        actions: plan.actions,
        zone: 'America/Denver',
        hours: { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' } as never,
        siloSeconds: plan.siloSeconds,
        startSilos: plan.start?.siloCount ?? null,
        startEgg: plan.start?.egg ?? null,
        saleCount: plan.saleCount ?? null,
        variantKey: plan.variantKey,
        now: NOW,
      }).lines;
    }, 600_000);
    afterAll(() => vi.useRealTimers());

    it('keeps building with the sale buys: Egg 53 first, no shift or rebuild before the sale ends', () => {
      const text = lines.slice(0, 3).map(l => lineText(l));
      expect(text[0]).toMatch(/Eggsistor Miniturization \(52 → 53\)/);
      expect(text[1]).toMatch(/Matter Reconfiguration \(142 → 143\)/);
      const firstShift = actions.find(a => a.kind === 'shift');
      expect(firstShift === undefined || firstShift.t > Date.parse('2026-11-12T00:00:00-07:00') / 1000).toBe(true);
    });
  }
);
