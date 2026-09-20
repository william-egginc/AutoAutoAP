/**
 * Step 0 of every ascension: make sure the EARNINGS set is equipped.
 *
 * WHY THIS EXISTS. PLAN.md's 13-shift template opens with "Artifacts start as earnings set", and H1
 * is documented as the switch away from it — but nothing ever put it on. Measured on a real
 * exported plan: the only `equip_artifact_set` in a 1,960-action ascension was H1's, with
 * `setName: 'elr'`, and `activeArtifactSet` read `'elr'` on every action of every variant. So
 * shifts 1-7 — the whole money-making phase that buys the research, vehicles, habs and silos the
 * ascension then runs on — were funded at the delivery set's earning rate instead of the earnings
 * set's. Less income buys fewer upgrades; fewer upgrades means a lower peak delivery rate when K3
 * finally measures it; and the ascension comes back slower for reasons nothing in the plan explains.
 *
 * A GUARD, NOT AN INSTRUCTION. C1 calls it, so the invariant becomes true however the state
 * arrived — a fresh prestige, a resumed plan, a hand-edited history, or some future caller that
 * sets it up properly and makes this a no-op. Already-equipped short-circuits before allocating
 * anything.
 *
 * FREE IN GAME TIME, like H1's swap: artifact changes are instantaneous, so this adds no seconds
 * and cannot eat the time budget the purchase steps are spending.
 *
 * Extracted from c1.ts rather than written inline so it can be tested without running C1's purchase
 * machinery, which is bounded by game time rather than by iteration count and takes minutes to
 * simulate against a wealthy fixture.
 */
import type { Action } from '@/types/actions/meta';
import { createSimAction } from '@/types/actions/meta';
import { getOptimalEarningsSet } from '@/lib/artifacts/virtue';
import type { EngineState, SimulationContext } from '../../types';
import { applyDecoratedAction } from './actionHelpers';

export interface EnsureEarningsSetResult {
  actions: Action[];
  state: EngineState;
}

export function ensureEarningsSetEquipped(state: EngineState, context: SimulationContext): EnsureEarningsSetResult {
  if (state.activeArtifactSet === 'earnings') return { actions: [], state };

  // Prefer the set the plan already solved; fall back to solving one from the backup, the same way
  // H1 solves its ELR set rather than trusting whatever happens to be stored.
  const earnings = state.artifactSets?.earnings?.length
    ? state.artifactSets.earnings
    : context.rawBackup
      ? getOptimalEarningsSet(context.rawBackup)
      : null;

  // Nothing to equip is not a failure: an account with no virtue artifacts has no earnings set to
  // put on, and forcing an empty loadout would strip whatever it does have.
  if (!earnings?.length) return { actions: [], state };

  const updated = applyDecoratedAction(
    state,
    context,
    createSimAction('update_artifact_set', { setName: 'earnings', newLoadout: earnings })
  );
  const equipped = applyDecoratedAction(
    updated.state,
    context,
    createSimAction('equip_artifact_set', { setName: 'earnings' })
  );

  return { actions: [updated.action, equipped.action], state: equipped.state };
}
