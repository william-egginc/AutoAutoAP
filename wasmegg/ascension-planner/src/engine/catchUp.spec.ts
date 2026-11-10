/**
 * THE SAVE CATCH-UP IS NOT CAPPED AT THE SILOS (spec-nosilocap, 10 Nov 2026). Jordan: "get rid of the amber box and just
 * follow it like Joo's does". computeSnapshot credits a farm's time away from its last sync (a real timestamp) to the plan
 * start; Joo's engine credits all of it, ours stopped at what the silos hold (lib/saveAge.ts catchUpSeconds). Cells are
 * built from 0-based simulation time, which never takes this path.
 */
import { describe, expect, test } from 'vitest';
import { modifiersFromColleggtibleTiers } from 'lib/collegtibles';
import { computeSnapshot } from './compute';
import { siloSeconds } from '@/lib/saveAge';
import type { EngineState, SimulationContext } from '@/auto/types';

const SYNC = 1_790_000_000;

function farm(): EngineState {
  return {
    currentEgg: 'curiosity',
    shiftCount: 0,
    te: 0,
    soulEggs: 0,
    bankValue: 0,
    habIds: [0, null, null, null],
    vehicles: [{ vehicleId: 0, trainLength: 1 }],
    researchLevels: {},
    siloCount: 1,
    tankLevel: 0,
    artifactLoadout: [],
    activeArtifactSet: null,
    artifactSets: { earnings: null, elr: null },
    fuelTankAmounts: {} as EngineState['fuelTankAmounts'],
    eggsDelivered: {} as EngineState['eggsDelivered'],
    teEarned: {} as EngineState['teEarned'],
    population: 1e8,
    lastStepTime: SYNC,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  };
}

const ctx = (start: number): SimulationContext => ({
  epicResearchLevels: {},
  colleggtibleModifiers: modifiersFromColleggtibleTiers({}),
  ascensionStartTime: start,
  planStartOffset: 0,
  assumeDoubleEarnings: false,
  deferForEarningsMode: false,
});

describe('computeSnapshot catch-up from a save', () => {
  const silo = siloSeconds(1, 0);
  const bank = (gap: number) => computeSnapshot(farm(), ctx(SYNC + gap)).bankValue;

  test('there is catch-up inside the silos (a control)', () => {
    expect(bank(silo / 2)).toBeGreaterThan(0);
  });

  test('a gap of two and a half times what the silos hold earns more than one silo-time of catch-up', () => {
    expect(bank(2.5 * silo)).toBeGreaterThan(bank(silo) * 1.5);
  });
});
