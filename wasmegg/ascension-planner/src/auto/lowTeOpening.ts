/**
 * THE OPENING SWITCH (egg-beta2, 21 Oct 2026): which opening a build takes when its first
 * C1 -> K1 -> I1 pass (I1 capped at 4 hours, shifts/i1.ts) can't max the habs. That happens to low
 * earners, mostly below TE 120; a build whose first pass maxes the habs takes that pass either way.
 *
 *  - 'rounds' (DEFAULT, ours): PR 717 (wasmegg-carpet/egg c6a8e406 "cki cki start"), the opening our
 *    fork ran below TE 120 since 13 Oct (the "low-TE gate"): more C1 -> K1 -> I1 rounds from the first
 *    pass until an I1 ends with every slot a Chicken Universe (auto/ascension.ts
 *    `continueOpeningRounds`).
 *  - 'v2': Joo's "v2 low-TE opening" (1571a70a): the first pass is thrown away and eight two-round
 *    openings (CKI/CIK x CKI/CIK x a 30-minute or 4-hour second C1) are simulated from the empty
 *    farm, the best by hab capacity, then shipping, then the earliest end of C2 (auto/ascension.ts
 *    `compareOpenings`).
 *
 * Why 'rounds' is the default: measured on the TE 75 h123 cell (~/code/aaap-tools/notes/
 * joo-te75-trace.md), v2 picks CIK CIK, which reaches C2 sooner but skips C2's 3.2 hours of research
 * (compareOpenings counts C2's time as cost and credits none of what it buys), so its K3 trains are
 * shorter: TE 75 -> 120 took 95.1 days with v2 and 83.3 with rounds. Flip `DEFAULT_OPENING_FALLBACK`
 * to 'v2' to run Joo's opening everywhere; `SimulationContext.openingFallback` overrides it per run
 * (tests and the precompute probes).
 *
 * Before egg-beta2 this file held our whole low-TE gate (rounds only below TE 120, and only when the
 * old opening's uncapped I1 sat past 4 hours). Joo's code now runs the capped first pass for every
 * build, so the gate, its TE floor and its own C3 Tier 12 step are gone (his c3.ts unlocks Tier 12
 * for every build, 85dd6af2).
 */
import type { EngineState, SimulationContext } from './types';

export type OpeningFallback = 'rounds' | 'v2';

/** The opening every build takes when one pass can't max the habs. See the note at the top. */
export const DEFAULT_OPENING_FALLBACK: OpeningFallback = 'rounds';

export function openingFallback(context: SimulationContext): OpeningFallback {
  return context.openingFallback ?? DEFAULT_OPENING_FALLBACK;
}

/** Backstop against looping forever on a farm whose earnings can't make hab progress. The final
 *  round's I1 runs uncapped, so the 'rounds' opening always ends with max habs. */
export const MAX_OPENING_ROUNDS = 10;

/** Whether this build's opening needed more than one round (`EngineState.lowTeOpening`). */
export function onLowTePath(state: EngineState): boolean {
  return !!state.lowTeOpening;
}
