/**
 * A Manual plan in the older raw format (no endState) imports by recalculating, and a file that cannot be
 * imported changes nothing (red team 21 Oct 2026, data-inputs #4: "Failed to import plan" left a plan of
 * 0/hr rates and an empty Available Actions panel behind, and the draft kept it across reloads).
 */
import '../../../scripts/node-shims';
import { describe, it, expect, beforeEach } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { syntheticBackup } from '@/test/syntheticSave';
import { loadAndSyncBackup } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { useActionsStore } from '@/stores/actions';
import { useNotesStore } from '@/stores/notes';
import { useInitialStateStore } from '@/stores/initialState';
import { exportPlanData, PlanImportError } from './io';

beforeEach(async () => {
  setActivePinia(createPinia());
  await resetAllStores();
  loadAndSyncBackup('file', markRaw(syntheticBackup()), 'plan_next');
  const a = useActionsStore();
  await a.setInitialSnapshot(computeSnapshot(createBaseEngineState(null), getSimulationContext()));
});

/** A plan with a 2x boost, a research sale and a shift: the steps the red team's file had. */
function buildPlan() {
  const a = useActionsStore();
  const shifts = a.currentSnapshot.shiftCount;
  const draft = (id: string, type: string, payload: object) =>
    a.pushAction({ id, type, payload, dependsOn: [], timestamp: 1 } as never);
  draft('b1', 'toggle_earnings_boost', { active: true, multiplier: 2 });
  draft('s1', 'toggle_sale', { saleType: 'research', active: true, multiplier: 0.3 });
  draft('h1', 'shift', { fromEgg: 'curiosity', toEgg: 'integrity', newShiftCount: shifts + 1 });
  return JSON.parse(JSON.stringify(exportPlanData(a.actions, a.initialSnapshot)));
}

describe('importing a Manual plan without endState', () => {
  it('recalculates it and gives the same plan as the full file', async () => {
    const full = buildPlan();
    const a = useActionsStore();
    const expected = a.actions.map(x => [x.type, x.endState.currentEgg, x.endState.lastStepTime]);
    const raw = JSON.parse(JSON.stringify(full));
    for (const x of raw.actions) delete x.endState;

    await a.clearAll(undefined, true);
    await a.importPlan(JSON.stringify(raw));
    expect(a.actions.map(x => [x.type, x.endState.currentEgg, x.endState.lastStepTime])).toEqual(expected);
    expect(a.currentSnapshot.currentEgg).toBe('integrity');
    expect(a.currentSnapshot.onlineIHR).toBeGreaterThan(0);
    expect(a.currentSnapshot.layRate).toBeGreaterThan(0);
  });

  it('a file that fails changes nothing: same actions, notes and stores', async () => {
    buildPlan();
    const a = useActionsStore();
    useNotesStore().setNotes([{ id: 'n', text: 'mine' }] as never);
    const before = JSON.stringify(a.actions);
    const soulEggs = useInitialStateStore().soulEggs;
    const json = a.lastSavedActionsJson;

    for (const bad of [
      '{not json',
      JSON.stringify({ version: 1, actions: {}, initialState: {} }),
      JSON.stringify({ version: 1, actions: [{ type: 'teleport' }], initialState: {} }),
      JSON.stringify({ version: 1, actions: [{ type: 'shift', payload: 'x' }], initialState: {} }),
    ]) {
      await expect(a.importPlan(bad)).rejects.toBeInstanceOf(PlanImportError);
      expect(JSON.stringify(a.actions)).toBe(before);
    }

    // One that passes the checks but fails while recalculating (hydrated stores included) is rolled back too.
    const broken = {
      version: 1,
      initialState: { soulEggs: 5, nickname: 'x' },
      notesState: { notes: [] },
      actions: [
        { type: 'start_ascension', payload: { initialEgg: 'curiosity' } },
        { type: 'buy_hab', payload: { slotIndex: 0, habId: 'nope' } },
      ],
    };
    await expect(a.importPlan(JSON.stringify(broken))).rejects.toThrow();
    expect(JSON.stringify(a.actions)).toBe(before);
    expect(a.lastSavedActionsJson).toBe(json);
    expect(useInitialStateStore().soulEggs).toBe(soulEggs);
    expect(useNotesStore().notes).toEqual([{ id: 'n', text: 'mine' }]);
    expect(a.currentSnapshot.onlineIHR).toBeGreaterThan(0);
  });
});
