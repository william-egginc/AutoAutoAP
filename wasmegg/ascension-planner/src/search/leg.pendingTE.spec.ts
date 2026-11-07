/**
 * THE FARM IN THE SAVE EARNS AT ITS CLAIMED TE (design spec, failing first; game expert, 6 Nov 2026).
 *
 * Game rule (primer 4, Jordan 22 Oct): a Truth Egg that an egg's deliveries have passed is pending until a prestige
 * claims it; the x1.1 earnings bonus counts only claimed TE. Jordan's 9:03 am save: 197 claimed, 198 passed (one
 * pending). The planner's start state for the CURRENT farm carries te = 198 (`planFuture.ts` `rollUpPendingTE`, meant
 * for a plan that starts at the next prestige), so the build-up's earnings are x1.1 too rich: measured against the
 * saves, the simulator's offline rate was 1.10 times what the farm really earned (real/sim 0.909 from 10:05 to 12:32),
 * and pricing the first leg at 197 lands 222 on Dec 31 at 10:16 pm instead of 1:24 pm (+8 h 52 m).
 *
 * Wanted: the state the farm in the save starts from (`continueState`, and the build-up state made from it) has
 * te = claimed TE. The next ascension (after the prestige) still starts at claimed + pending.
 * Needs a test-only `export` of `continueState` in search/leg.ts (it is a plain function today).
 *
 * Also (spec-pendingte fix, 6 Nov 2026): every current-ascension start is made by `continueState` (Right now and the
 * Build-up tracker through chain.ts `runLeg`, the instant answer's build-up tails and continue tail, Custom and Fast),
 * so these check the build-up state, that the pending TE still counts toward the stop and is claimed at the next
 * prestige, that a pending TE earns nothing during the build-up while the same TE claimed does, and that a TE the
 * planner set itself (the starting-TE override) is claimed as set.
 */
import '../../scripts/node-shims';

import { describe, expect, it, vi } from 'vitest';
import { PLAN_START, syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import { TE_BREAKPOINTS, getThresholdForTE } from '@/lib/truthEggs';
import { computeSnapshot } from '@/engine/compute';
import { deriveNextStartState } from '@/auto/ascension';
import { buildUpStateForCheck, continueState, continueVariantForCheck } from './leg';
import type { EngineState } from '@/engine/types';

/** The synthetic save with one pending TE on Curiosity (the egg its farm is on), and its claimed TE. */
async function pendingInputs(claimTheOne = false) {
  let claimed = 0;
  const inputs = await syntheticInputs(() => {
    const b = syntheticBackup();
    b.virtue.eggsDelivered[0] = TE_BREAKPOINTS[b.virtue.eovEarned[0]] * 1.01; // passes the next threshold: 1 pending
    if (claimTheOne) b.virtue.eovEarned[0] += 1; // the same eggs, that TE claimed
    claimed = (b.virtue.eovEarned as number[]).reduce((a, n) => a + n, 0);
    return b;
  });
  return { inputs, claimed };
}

describe('the farm in the save with one pending TE', () => {
  it('earns at the claimed TE, not claimed + pending', async () => {
    let claimed = 0;
    const inputs = await syntheticInputs(() => {
      const b = syntheticBackup();
      claimed = (b.virtue.eovEarned as number[]).reduce((a, n) => a + n, 0);
      b.virtue.eggsDelivered[0] = TE_BREAKPOINTS[b.virtue.eovEarned[0]] * 1.01; // passes the next threshold: 1 pending
      return b;
    });
    const st = continueState(inputs, inputs.baseState as never)!;
    expect(st.te).toBe(claimed);
  });
  it('control: with nothing pending, te is the claimed TE', async () => {
    let claimed = 0;
    const inputs = await syntheticInputs(() => {
      const b = syntheticBackup();
      claimed = (b.virtue.eovEarned as number[]).reduce((a, n) => a + n, 0);
      return b;
    });
    expect(continueState(inputs, inputs.baseState as never)!.te).toBe(claimed);
  });

  it('the build-up state too, its earnings 1/1.1 of claimed + pending; the base state keeps the pending TE', async () => {
    const { inputs, claimed } = await pendingInputs();
    expect(inputs.baseState.te).toBe(claimed + 1);
    expect(inputs.currentTE).toBe(claimed + 1);
    const st = buildUpStateForCheck(inputs, inputs.baseState, PLAN_START)!;
    expect(st.te).toBe(claimed);
    expect(st.teEarned.curiosity).toBe(inputs.baseState.teEarned.curiosity - 1);
    expect(st.eggsDelivered.curiosity).toBeGreaterThanOrEqual(inputs.baseState.eggsDelivered.curiosity);
    const ctx = { ...inputs.context, ascensionStartTime: PLAN_START, planStartOffset: 0 };
    const pay = (s: EngineState) => computeSnapshot(s, ctx, { skipGrowth: true }).offlineEarnings;
    expect(pay(st) / pay({ ...st, te: claimed + 1 })).toBeCloseTo(1 / 1.1, 9);
  });

  it('the pending TE still counts toward the stop, and the next ascension starts with it claimed', async () => {
    const { inputs, claimed } = await pendingInputs();
    // Already reached: the pending TE is the ascension's (claimed at its prestige), no wait for it.
    const there = continueVariantForCheck(inputs, inputs.baseState, PLAN_START, claimed + 1, 1)!;
    expect(there.summary.endTE).toBe(claimed + 1);
    expect(there.summary.totalDurationSeconds).toBe(0);
    const next = deriveNextStartState(there.summary, inputs.baseState);
    expect(next.te).toBe(claimed + 1);
    // One more is one wait.
    const one = continueVariantForCheck(inputs, inputs.baseState, PLAN_START, claimed + 2, 1)!;
    expect(one.summary.endTE).toBe(claimed + 2);
    expect(one.summary.totalDurationSeconds).toBeGreaterThan(0);
    expect(deriveNextStartState(one.summary, inputs.baseState).te).toBe(claimed + 2);
  });

  it('a pending TE earns nothing in the build-up; the same TE claimed does', async () => {
    const pending = await pendingInputs();
    const claimedToo = await pendingInputs(true);
    // The same eggs and the same TE count (the planner's TE was the same for both before the fix) ...
    expect(claimedToo.claimed).toBe(pending.claimed + 1);
    expect(claimedToo.inputs.currentTE).toBe(pending.inputs.currentTE);
    expect(claimedToo.inputs.baseState.eggsDelivered).toEqual(pending.inputs.baseState.eggsDelivered);
    // ... but the build-up's away cash (the hour from the save's sync to the plan start) is 1/1.1 on the farm that
    // has only claimed 190.
    const away = (i: typeof pending) =>
      buildUpStateForCheck(i.inputs, i.inputs.baseState, PLAN_START)!.bankValue - (i.inputs.currentFarmState!.cash || 0);
    expect(away(claimedToo)).toBeGreaterThan(0);
    expect(away(pending) / away(claimedToo)).toBeCloseTo(1 / 1.1, 9);
  });

  it('a TE the planner set itself (the starting-TE override) is claimed as set', async () => {
    const { inputs, claimed } = await pendingInputs();
    // As auto/startingTE.ts writeClaimedTE leaves Integrity at 45: its eggs at exactly that TE's threshold.
    const base = JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
    const was = base.teEarned.integrity;
    base.teEarned.integrity = 45;
    base.eggsDelivered.integrity = getThresholdForTE(45);
    const st = continueState(inputs, base)!;
    expect(st.teEarned.integrity).toBe(45);
    expect(st.te).toBe(claimed + 45 - was);
  });
});

// spec-workervirtue (6 Nov 2026): the workers' trimmed save lost its `virtue` block, and claimedTEEarned read that as
// "0 claimed on every egg" (min(te, 0)), so every worker priced the farm in the save at TE 0. A save without the block
// now falls back to the base state's TE (the behaviour before spec-pendingte), never 0, and says so once.
describe('a save without a virtue block', () => {
  it("falls back to the base state's TE, not 0, and warns once", async () => {
    const { inputs, claimed } = await pendingInputs();
    const raw = { ...(inputs.context.rawBackup as object), virtue: undefined };
    const noVirtue = { ...inputs, context: { ...inputs.context, rawBackup: raw } } as typeof inputs;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const st = continueState(noVirtue, inputs.baseState)!;
      expect(st.te).toBe(inputs.baseState.te);
      expect(st.te).toBe(claimed + 1);
      expect(st.teEarned).toEqual(inputs.baseState.teEarned);
      continueState(noVirtue, inputs.baseState);
      expect(warn.mock.calls.filter(c => String(c[0]).includes('virtue'))).toHaveLength(1);
      // With the block, the claimed TE as before.
      expect(continueState(inputs, inputs.baseState)!.te).toBe(claimed);
    } finally {
      warn.mockRestore();
    }
  });
});
