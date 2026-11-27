/**
 * THE INSTANT ANSWER'S BUILD-UP TAILS, AS A WORKER WORKS THEM OUT, on Jordan's main (spec-workervirtue, 6 Nov 2026):
 * the save of Nov 6, 2026, 10:23 pm (scrubbed, read where it is, never copied), 197 TE claimed, mid build-up.
 *
 * The workers' trimmed save (search/workerBackup.ts) dropped the save's `virtue` block, so after spec-pendingte every
 * worker read the farm's claimed TE as 0 (search/leg.ts claimedTEEarned): on this save the tails came back [] (no
 * C3 variant at TE 0 buys anything, and NO EMPTY BUILD-UP drops them all), and the instant answer said "prestige now"
 * (aaap-tools notes/buildup-tails-iphone-2026-11-06.md). This runs `buildUpTailParamsV2` on exactly what the pool
 * sends a worker (`structuredClone(workerCopy(inputsForWorkers(inputs)))`) and on the full save, as the page has it.
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1 (about 10 seconds when it runs):
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/search/workerBackup.main.save.spec.ts
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
import { buildUpTailParamsV2, continueState } from './leg';
import { inputsForWorkers } from './workerBackup';
import { workerCopy } from './workerCopy';
import type { SearchInputs } from './types';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-06-2228.json');
const hasSave = existsSync(SAVE);

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)(
  "Jordan's main, Nov 6 10:23 pm: a worker's build-up tails",
  () => {
    let page: SearchInputs;
    let worker: SearchInputs;
    beforeAll(async () => {
      const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
      const t = Math.floor(backup.approxTime);
      vi.useFakeTimers({ now: t * 1000, toFake: ['Date'] });
      setActivePinia(createPinia());
      // Never a real player ID in anything this spec prints.
      backup.eiUserId = 'EI0000000000000000';
      resolveColleggtibleContracts(backup);
      await initPlanFuture('file', markRaw(backup));
      const store = useChainSearchStore();
      store.setFirstAscension('auto');
      store.pinPlanStart(t);
      page = store.collectInputs();
      worker = structuredClone(workerCopy(inputsForWorkers(page)));
    }, 600_000);
    afterAll(() => vi.useRealTimers());

    it('the farm in the save starts at its claimed 197 TE in the worker, as on the page', () => {
      expect(continueState(worker, worker.baseState)!.te).toBe(197);
      expect(continueState(page, page.baseState)!.te).toBe(197);
    });

    it('has build-up tails (it had none), the same as with the full save', () => {
      const tails = buildUpTailParamsV2(worker, worker.planStart);
      // 3, as the page has had all day (it was 0 in the worker from the 2:53 pm save on).
      expect(tails.length).toBe(3);
      expect(JSON.stringify(tails)).toBe(JSON.stringify(buildUpTailParamsV2(page, page.planStart)));
    }, 600_000);
  }
);
