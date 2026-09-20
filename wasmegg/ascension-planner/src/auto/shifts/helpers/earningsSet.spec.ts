/**
 * The step that was missing from every generated plan.
 *
 * Measured on a real export before this existed: the only `equip_artifact_set` in a 1,960-action
 * ascension was H1's `'elr'`, and `activeArtifactSet` read `'elr'` on every action of every
 * variant — so the whole money-making phase ran on the delivery set. These tests exist so that
 * cannot come back quietly.
 */
import { describe, expect, it } from 'vitest';
import { modifiersFromColleggtibleTiers } from 'lib/collegtibles';
import { ensureEarningsSetEquipped } from './earningsSet';
import type { EngineState, SimulationContext } from '../../types';

const EARNINGS_SET = [
  { artifactId: 'demeters_necklace_4_3', stones: [] },
  { artifactId: 'lunar_totem_4_3', stones: [] },
];

function fakeState(overrides: Partial<EngineState> = {}): EngineState {
  return {
    currentEgg: 'curiosity',
    shiftCount: 0,
    te: 0,
    soulEggs: 1e20,
    bankValue: 0,
    habIds: [0, null, null, null],
    vehicles: [{ vehicleId: 0, trainLength: 1 }],
    researchLevels: {},
    siloCount: 2,
    tankLevel: 0,
    artifactLoadout: [],
    activeArtifactSet: null,
    artifactSets: { earnings: null, elr: null },
    fuelTankAmounts: {} as EngineState['fuelTankAmounts'],
    eggsDelivered: {} as EngineState['eggsDelivered'],
    teEarned: {} as EngineState['teEarned'],
    population: 1e18,
    lastStepTime: 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
    ...overrides,
  };
}

function fakeContext(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    epicResearchLevels: {},
    colleggtibleModifiers: modifiersFromColleggtibleTiers({}),
    ascensionStartTime: 0,
    planStartOffset: 0,
    assumeDoubleEarnings: false,
    deferForEarningsMode: false,
    ...overrides,
  };
}

describe('ensureEarningsSetEquipped', () => {
  it('equips the plan’s earnings set when something else is on', () => {
    const state = fakeState({
      activeArtifactSet: 'elr',
      artifactSets: { earnings: EARNINGS_SET, elr: null },
    });
    const { actions, state: next } = ensureEarningsSetEquipped(state, fakeContext());

    expect(actions.map(a => a.type)).toEqual(['update_artifact_set', 'equip_artifact_set']);
    expect(next.activeArtifactSet).toBe('earnings');
  });

  // The state a fresh prestige arrives in: no set declared at all.
  it('equips it when no set is active', () => {
    const state = fakeState({ artifactSets: { earnings: EARNINGS_SET, elr: null } });
    expect(ensureEarningsSetEquipped(state, fakeContext()).state.activeArtifactSet).toBe('earnings');
  });

  // A guard, not an instruction: it must be safe to call on a state that is already correct.
  it('does nothing when the earnings set is already on', () => {
    const state = fakeState({
      activeArtifactSet: 'earnings',
      artifactSets: { earnings: EARNINGS_SET, elr: null },
    });
    const { actions, state: next } = ensureEarningsSetEquipped(state, fakeContext());

    expect(actions).toEqual([]);
    expect(next).toBe(state);
  });

  // An account with no virtue artifacts has no earnings set to put on, and forcing an empty
  // loadout would strip whatever it does have.
  it('leaves the loadout alone with no set and no backup to solve one from', () => {
    const state = fakeState({ activeArtifactSet: 'elr' });
    const { actions, state: next } = ensureEarningsSetEquipped(state, fakeContext());

    expect(actions).toEqual([]);
    expect(next.activeArtifactSet).toBe('elr');
  });

  it('is idempotent — running it twice equips once', () => {
    const state = fakeState({ artifactSets: { earnings: EARNINGS_SET, elr: null } });
    const once = ensureEarningsSetEquipped(state, fakeContext());
    const twice = ensureEarningsSetEquipped(once.state, fakeContext());

    expect(once.actions).toHaveLength(2);
    expect(twice.actions).toEqual([]);
  });
});
