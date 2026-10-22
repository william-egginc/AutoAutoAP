/**
 * A save with something newer than this planner's data (red team 21 Oct 2026, data-inputs #8): hab id
 * 99 crashed plan generation ("reading 'id'" in calculateHabCapacity_Full), and an epic research level
 * of 9999 showed "CLOTHED TE NAN". Each value is held to the nearest known, with a note for the player.
 */
import '../../scripts/node-shims';
import { describe, it, expect, beforeEach } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { syntheticBackup } from '@/test/syntheticSave';
import { loadAndSyncBackup } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { useInitialStateStore } from '@/stores/initialState';
import { habTypes } from '@/lib/habs';
import { vehicleTypes } from '@/lib/vehicles';
import { epicResearchDefs } from '@/lib/epicResearch';
import { getOptimalEarningsSet } from '@/lib/artifacts/virtue';
import { guardEpicLevels, guardFarm, saveGuardNote } from './saveGuard';

const LAST_HAB = habTypes.length - 1;

function futureSave() {
  const b = syntheticBackup();
  b.farms[0].habs = [99, 12, -3, 19];
  b.farms[0].vehicles = [9, 77, 10];
  b.farms[0].trainLength = [5, 999, 8];
  b.farms[0].commonResearch.push({ id: 'comfy_nests', level: 99999 });
  b.game.epicResearch = [...b.game.epicResearch, { id: 'cheaper_research', level: 9999 }, { id: 'epic_egg_laying', level: 9999 }];
  return b;
}

beforeEach(async () => {
  setActivePinia(createPinia());
  await resetAllStores();
});

describe('a save newer than the planner', () => {
  it('loads, holds each value to the nearest known, and says so', () => {
    loadAndSyncBackup('file', markRaw(futureSave()), 'continue_earnings');
    const st = useInitialStateStore();
    expect(st.currentFarmState!.habs).toEqual([LAST_HAB, 12, null, null]);
    expect(st.currentFarmState!.vehicles.map(v => v.vehicleId)).toEqual([9, vehicleTypes.length - 1, 10]);
    expect(st.currentFarmState!.vehicles[1].trainLength).toBe(10);
    const lab = epicResearchDefs.find(d => d.id === 'cheaper_research')!;
    expect(st.epicResearchLevels.cheaper_research).toBe(lab.maxLevel);
    expect(st.saveNote).toContain('hab 99 (newer than this planner), counted as Chicken Universe');
    expect(st.saveNote).toContain('Lab Upgrade level 9999, counted as 10');
    expect(st.saveNote).toMatch(/and \d+ more\)/);
  });

  it('plans from it without NaN or a crash (the hab capacity read that threw)', () => {
    loadAndSyncBackup('file', markRaw(futureSave()), 'continue_earnings');
    const snap = computeSnapshot(createBaseEngineState(null), getSimulationContext());
    expect(Number.isFinite(snap.habCapacity)).toBe(true);
    expect(snap.habCapacity).toBeGreaterThan(0);
    expect(Number.isFinite(snap.elr)).toBe(true);
  });

  it('the artifact set read from the backup itself (Clothed TE) is finite too', () => {
    const set = getOptimalEarningsSet(futureSave() as never);
    expect(JSON.stringify(set)).not.toMatch(/NaN|null,null,null,null,null/);
  });

  it('a normal save has no note', () => {
    loadAndSyncBackup('file', markRaw(syntheticBackup()), 'continue_earnings');
    expect(useInitialStateStore().saveNote).toBe('');
  });
});

describe('guards', () => {
  it('guardEpicLevels: clamps, drops unknown ids and garbage', () => {
    const notes: string[] = [];
    expect(guardEpicLevels({ soul_eggs: 1e9, made_up: 3, prophecy_bonus: 'x', epic_hatchery: -2 }, notes)).toEqual({
      soul_eggs: 140,
      prophecy_bonus: 0,
      epic_hatchery: 0,
    });
    expect(notes).toHaveLength(3);
  });

  it('guardFarm keeps a good farm unchanged', () => {
    const farm = {
      habs: [1, 2, null, null],
      vehicles: [{ vehicleId: 11, trainLength: 4 }],
      commonResearches: { comfy_nests: 2 },
    } as never;
    const notes: string[] = [];
    expect(guardFarm(farm, notes)).toEqual(farm);
    expect(saveGuardNote(notes)).toBe('');
  });
});
