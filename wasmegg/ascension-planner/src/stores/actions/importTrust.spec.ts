/**
 * A plan file's saved results are not trusted (red team 21 Oct 2026, data-inputs #7): with every action
 * carrying an endState the import took them as they were, so a last `endState.te` of 99999 and an
 * `initialTeEarned` of 9999 showed "TE GAINED +-9972". File imports drop the results and recalculate,
 * and TE from a file is held to 0..98 per egg.
 */
import '../../../scripts/node-shims';
import { describe, it, expect, beforeEach } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { syntheticBackup } from '@/test/syntheticSave';
import { loadAndSyncBackup } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { useActionsStore } from '@/stores/actions';
import { useInitialStateStore } from '@/stores/initialState';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { dropFileResults, exportPlanData, parsePlanFile } from './io';

beforeEach(async () => {
  setActivePinia(createPinia());
  await resetAllStores();
  loadAndSyncBackup('file', markRaw(syntheticBackup()), 'plan_next');
  await useActionsStore().setInitialSnapshot(computeSnapshot(createBaseEngineState(null), getSimulationContext()));
});

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("a plan file's results", () => {
  it('are recalculated, not taken: a forged TE in the last endState does not survive', async () => {
    const a = useActionsStore();
    const shifts = a.currentSnapshot.shiftCount;
    a.pushAction({
      id: 'h1',
      type: 'shift',
      payload: { fromEgg: 'curiosity', toEgg: 'integrity', newShiftCount: shifts + 1 },
      dependsOn: [],
      timestamp: 1,
    } as never);
    const honest = sum(a.currentSnapshot.teEarned);
    const file = JSON.parse(JSON.stringify(exportPlanData(a.actions, a.initialSnapshot)));
    const last = file.actions[file.actions.length - 1];
    last.endState.te = 99999;
    last.endState.teEarned = { curiosity: 9999, integrity: 9999, humility: 0, resilience: 0, kindness: 0 };
    file.initialState.initialTeEarned = { ...file.initialState.initialTeEarned, curiosity: 9999 };
    file.truthEggsState.teEarned = { ...file.truthEggsState.teEarned, curiosity: 9999 };

    await a.clearAll(undefined, true);
    await a.importPlan(JSON.stringify(dropFileResults(parsePlanFile(JSON.stringify(file)))));
    expect(a.currentSnapshot.te).toBeLessThanOrEqual(490);
    for (const n of Object.values(a.currentSnapshot.teEarned)) expect(n).toBeLessThanOrEqual(98);
    expect(useInitialStateStore().initialTeEarned.curiosity).toBe(98);
    expect(useTruthEggsStore().teEarned.curiosity).toBeLessThanOrEqual(98);
    expect(sum(a.currentSnapshot.teEarned)).toBeLessThanOrEqual(490);
    expect(honest).toBeLessThanOrEqual(490);
  });

  it('dropFileResults removes every endState and nothing else', () => {
    const d = dropFileResults({ version: 1, actions: [{ type: 'shift', endState: { te: 1 }, cost: 3 }, null] });
    expect(d.actions[0]).toEqual({ type: 'shift', cost: 3 });
  });

  it('both file imports drop results: the summary bar Import and the Plan Library', () => {
    const summary = readFileSync(new URL('../../components/PlanFinalSummary.vue', import.meta.url), 'utf8');
    expect(summary).toContain('importPlan(JSON.stringify(dropFileResults(parsePlanFile(jsonString))))');
    const library = readFileSync(new URL('../../components/PlanLibrary.vue', import.meta.url), 'utf8');
    expect(library).toContain('for (const p of plansToImport) dropFileResults(p.data);');
  });
});
