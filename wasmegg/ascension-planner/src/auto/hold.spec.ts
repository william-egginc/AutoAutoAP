import { describe, expect, it, vi } from 'vitest';

// The farm's rate and earnings come from the snapshot; fixed here so the arithmetic is exact.
vi.mock('../engine/compute', () => ({
  computeSnapshot: () => ({ elr: 1e12, offlineEarnings: 5 }),
}));
vi.mock('../engine/apply', () => ({
  applyAction: (s: unknown) => ({ ...(s as object) }),
}));

import { eggOfShift, heldSecondsOf, holdForPlayer } from './hold';
import type { EngineState, SimulationContext } from './types';
import { countTEThresholdsPassed, getThresholdForTE } from '@/lib/truthEggs';

const START = 1_800_000_000;
const state = (eggs: number) =>
  ({
    currentEgg: 'humility',
    eggsDelivered: { humility: eggs },
    teEarned: { humility: countTEThresholdsPassed(eggs) },
    te: countTEThresholdsPassed(eggs),
    bankValue: 0,
    lastStepTime: 0,
  }) as unknown as EngineState;
const context = (holdUntil?: (t: number) => number) =>
  ({
    ascensionStartTime: START,
    planStartOffset: 0,
    ...(holdUntil ? { holdUntil } : {}),
  }) as unknown as SimulationContext;

describe('holdForPlayer: an egg shift waits for the player, the farm laying meanwhile', () => {
  it('reads the egg off a shift name', () => {
    expect(['C1', 'I1', 'K3', 'R2', 'H2', 'X'].map(eggOfShift)).toEqual([
      'curiosity',
      'integrity',
      'kindness',
      'resilience',
      'humility',
      null,
    ]);
  });

  it('does nothing without the hook, without a change of egg, or with the player around', () => {
    const s = state(1e18);
    expect(holdForPlayer(s, context(), START, 100, 'kindness').heldSeconds).toBe(0);
    expect(
      holdForPlayer(
        s,
        context(t => t + 3600),
        START,
        100,
        'humility'
      ).heldSeconds
    ).toBe(0);
    const around = holdForPlayer(
      s,
      context(t => t),
      START,
      100,
      'kindness'
    );
    expect(around).toMatchObject({ heldSeconds: 0, elapsedSeconds: 100, actions: [] });
    expect(around.state).toBe(s);
  });

  it('credits the egg it is on for the whole wait: eggs, TE, bank and the clock', () => {
    // Half an hour short of the next threshold at 1e12 eggs a second: the hour's wait passes it.
    const next = getThresholdForTE(countTEThresholdsPassed(1e18) + 1);
    const before = next - 1e12 * 1800;
    const h = holdForPlayer(
      state(before),
      context(t => t + 3600),
      START,
      600,
      'kindness'
    );
    expect(h.heldSeconds).toBe(3600);
    expect(h.elapsedSeconds).toBe(4200);
    expect(h.state.lastStepTime).toBe(4200);
    expect(h.state.eggsDelivered.humility).toBe(before + 1e12 * 3600);
    expect(h.state.te).toBe(countTEThresholdsPassed(before) + 1);
    expect(h.state.bankValue).toBe(5 * 3600);
    // Still on its own egg: the shift itself is the caller's, after the wait.
    expect(h.state.currentEgg).toBe('humility');
    expect(h.actions).toHaveLength(1);
    expect(h.actions[0].type).toBe('wait_for_te');
    expect((h.actions[0].payload as { heldForPlayer?: boolean }).heldForPlayer).toBe(true);
    expect(heldSecondsOf(h.actions)).toBe(3600);
  });
});
