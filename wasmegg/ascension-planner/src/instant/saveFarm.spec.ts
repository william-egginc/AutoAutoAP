/**
 * The instant answer's save inputs come from the raw backup: the same parse as Joo's loadFromBackup,
 * and untouched when his Continue Current load rewrites the store's farm in place (catchUpFarmState).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ei } from 'lib';
import { useInitialStateStore } from '@/stores/initialState';
import { catchUpFarmState } from '@/lib/modes/utils';
import type { CalculationsSnapshot } from '@/types';
import { getSimulationContext } from '@/engine/adapter';
import { baseStateFromBackup, eggsDeliveredFromBackup, farmFromBackup, saveSyncSeconds } from './saveFarm';
import { continueTail } from './continueTail';
import { saveStart } from './instantAnswer';

const SYNC = 1_800_000_000;

function backup(): ei.IBackup {
  return {
    userName: 'test',
    settings: { lastBackupTime: SYNC + 60 },
    game: { soulEggsD: 1e30, epicResearch: [{ id: 'silo_capacity', level: 20 }] },
    virtue: {
      shiftCount: 12,
      eggsDelivered: [5e12, 4e12, 3e12, 2e12, 1e12],
      eovEarned: [40, 38, 36, 34, 32],
    },
    farms: [
      { eggType: 1, eggsLaid: 1 },
      {
        eggType: 52,
        eggsLaid: 3e12,
        lastStepTime: SYNC,
        numChickens: 1,
        habPopulation: [2e9, 2e9, 1e9, 1e9],
        habs: [18, 18, 18, 19],
        vehicles: [11, 11],
        trainLength: [10],
        silosOwned: 10,
        cashEarned: 1e30,
        cashSpent: 4e29,
        commonResearch: [
          { id: 'comfy_nests', level: 50 },
          { id: 'leafsprings', level: 30 },
        ],
      },
    ],
  } as unknown as ei.IBackup;
}

describe('the save from the raw backup', () => {
  beforeEach(() => {
    // Joo's actions store reads localStorage when made (catchUpFarmState reaches it).
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
    setActivePinia(createPinia());
  });

  it('reads the farm and eggs exactly as Joo’s loadFromBackup does', () => {
    const b = backup();
    const store = useInitialStateStore();
    store.loadFromBackup('EI0000000000000000', b, 'default');
    expect(farmFromBackup(b)).toEqual(store.currentFarmState);
    expect(eggsDeliveredFromBackup(b)).toEqual(store.initialEggsDelivered);
    expect(farmFromBackup(b)?.population).toBe(6e9);
    expect(farmFromBackup(b)?.habs).toEqual([18, 18, 18, null]);
    expect(farmFromBackup(b)?.vehicles).toEqual([
      { vehicleId: 11, trainLength: 10 },
      { vehicleId: 11, trainLength: 1 },
    ]);
    expect(saveSyncSeconds(b)).toBe(SYNC);
    expect(saveSyncSeconds({ ...b, farms: [] })).toBe(SYNC + 60);
    expect(farmFromBackup(null)).toBeNull();
    const base = baseStateFromBackup(b);
    expect(base.te).toBe(40 + 38 + 36 + 34 + 32);
    expect(base.shiftCount).toBe(12);
    expect(base.teEarned.kindness).toBe(32);
  });

  it('is untouched when Joo’s continue load catches the store’s farm up in place', () => {
    const b = backup();
    const store = useInitialStateStore();
    store.loadFromBackup('EI0000000000000000', b, 'continue_elr');
    store.rawBackup = b;
    const start = SYNC + 3 * 3600;
    const inputs = () => {
      const delivered = saveStart(eggsDeliveredFromBackup(store.rawBackup)).delivered;
      return {
        farm: farmFromBackup(store.rawBackup),
        delivered,
        base: baseStateFromBackup(store.rawBackup),
        sync: saveSyncSeconds(store.rawBackup),
        cont: continueTail({
          farm: farmFromBackup(store.rawBackup),
          backup: store.rawBackup,
          base: baseStateFromBackup(store.rawBackup),
          context: getSimulationContext(),
          start,
          delivered,
        }),
      };
    };
    const before = JSON.parse(JSON.stringify(inputs()));
    expect(before.cont?.peakELR).toBeGreaterThan(0);

    // What lib/modes/continueCurrent.ts does on opening the Auto tab: population 0, cash 250, the
    // farm's eggs = the total, lastStepTime = now, the store's egg count rewritten.
    const live = store.currentFarmState!;
    catchUpFarmState(
      {
        currentEgg: 'humility',
        population: 0,
        bankValue: 250,
        eggsDelivered: { curiosity: 5e12, integrity: 4e12, humility: 9e12, resilience: 2e12, kindness: 1e12 },
      } as unknown as CalculationsSnapshot,
      0,
      start,
      { curiosity: 40, integrity: 38, humility: 36, resilience: 34, kindness: 32 }
    );
    expect(live.population).toBe(0);
    expect(live.lastStepTime).toBe(start);
    expect(store.initialEggsDelivered.humility).toBe(9e12);

    expect(JSON.parse(JSON.stringify(inputs()))).toEqual(before);
  });
});
