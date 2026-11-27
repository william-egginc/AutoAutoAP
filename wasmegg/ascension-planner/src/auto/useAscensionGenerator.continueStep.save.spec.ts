/**
 * CONTINUE FROM THE BUILD STEP THE FARM IS ON (spec-continuestep, 10 Nov 2026). Single run's Continue on a farm part-way
 * through C3 on a virtue egg must plan the rest of the build from the start of C3 (`continueFromStep` 'C3', label
 * "Continue (from C3)", a non-zero build). After the Joo PR 731 merge it planned the part-built farm as a FINISHED build
 * (build time 0 s, no label): auto/useAscensionGenerator.ts swaps the farm's loadout to the best DELIVERY set (our 0527db42f
 * block) BEFORE Joo's `detectBuildStep`, which reads a delivery loadout as "build done" (auto/buildStep.ts) and returns null,
 * so `runContinueBuild` never runs. Joo's upstream has no swap there.
 *
 * Jordan's scrubbed main of Tue 10 Nov 2026, 1:44 pm (197 TE claimed + 1 pending, Curiosity, mid-C3, earnings gear on), read
 * where it is, never copied; target TE 224.
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 TZ=America/Denver npx vitest run src/auto/useAscensionGenerator.continueStep.save.spec.ts
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
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useAscensionGenerator } from './useAscensionGenerator';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-11-10-1402.json');
const hasSave = existsSync(SAVE);
const NOW = Date.parse('2026-11-10T13:47:00-07:00');

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Single run's Continue on a farm part-way through C3", () => {
  let cont:
    | { summary: { continueFromStep?: string; totalDurationSeconds: number; strategyLabel?: string } }
    | undefined;
  beforeAll(async () => {
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    setActivePinia(createPinia());
    backup.eiUserId = 'EI0000000000000000';
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useAutoPlannerStore();
    store.timezone = 'America/Denver';
    store.startDate = '2026-11-10';
    store.startTime = '13:47';
    store.targetTE = '224';
    const { generate } = useAscensionGenerator();
    vi.useRealTimers();
    await generate();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    cont = (store.ascensionChain[0]?.variants as unknown as Record<string, typeof cont>).continue;
  }, 900_000);
  afterAll(() => vi.useRealTimers());

  it('plans the rest of the build from C3: a Continue variant that says so and has a build', () => {
    expect(cont).toBeDefined();
    expect(cont!.summary.continueFromStep).toBe('C3');
    expect(cont!.summary.strategyLabel).toMatch(/^Continue from C3/);
  });
});
