/**
 * THE SAVE CONTRADICTS THE FOLLOWED ROUTE (alt A1, 30 Oct 2026): a route followed from an older save kept its plan
 * start and its steps, and nothing offered to plan again from the newer save (the instant answer never asks about a
 * priced follow, lib/searchPlan.ts `mayPrompt`; a better finish is needed otherwise). When the save shows the follow is
 * stale, Right now offers "Re-plan from this save" (BetterRoutePrompt.vue): offered only, never swapped in.
 *
 * Stale, in this order (the first that holds is the reason):
 *   egg      the save's farm is on a virtue egg the followed route doesn't have it on at the save's time, nor anywhere
 *            within the grace either side (a shift just due, or done a little early, is not a contradiction). From the
 *            route's simulated legs only (lib/planPace.ts `planEggAt`); the table's legs don't say which egg.
 *   overdue  a planned shift or prestige whose time is more than the grace before the save's time, and which the save
 *            doesn't show done (lib/nowPlan.ts `planEvents` `notDone`: not on that egg, or below that TE, and nothing
 *            later, up to the grace ahead, shown done). Time off's leave and back are not steps.
 *   hours    the route was followed with other awake hours than the player's now (lib/followCloud.ts `sameHours`).
 * Times are the save's (its backup time), not the clock: a save can't show a step done after it was taken. Pure.
 */
import { planEvents, type NowPlan } from './nowPlan';
import { planEggAt } from './planPace';

/** How late a step may be before it counts (a save is taken now and then; the game is opened late). */
export const STALE_GRACE_SECONDS = 2 * 3600;

export type StaleReason =
  | { kind: 'egg'; saveEgg: string; planEgg: string }
  | { kind: 'overdue'; step: 'shift'; egg: string; at: number }
  | { kind: 'overdue'; step: 'prestige'; te: number; at: number }
  | { kind: 'hours' };

export function followStaleness(o: {
  /** The followed route as Right now has it (its own times, not this save's simulated current ascension). */
  plan: NowPlan | null;
  /** The save: its backup time (unix seconds), the virtue egg its farm is on (null: not on virtue or not known), its
   *  whole TE. */
  save: { seconds: number; egg: string | null; te: number } | null;
  /** The route was followed with other awake hours than the player's now. */
  hoursDiffer: boolean;
  graceSeconds?: number;
}): StaleReason | null {
  const grace = o.graceSeconds ?? STALE_GRACE_SECONDS;
  const plan = o.plan;
  const save = o.save;
  if (plan && save && save.seconds > 0) {
    const egg = eggReason(plan, save.seconds, save.egg, grace);
    if (egg) return egg;
    // Read up to the grace AHEAD too: a step done a little early shows every step before it done (an early K3 is
    // past C3), and only steps more than the grace behind can count.
    const late = planEvents(plan, save.seconds + grace, { egg: save.egg, te: save.te }).find(
      e => e.notDone && !e.timeOff && e.at <= save.seconds - grace && (e.kind === 'shift' || e.kind === 'prestige')
    );
    if (late?.kind === 'shift' && late.egg) return { kind: 'overdue', step: 'shift', egg: late.egg, at: late.at };
    if (late?.kind === 'prestige' && typeof late.te === 'number') return { kind: 'overdue', step: 'prestige', te: late.te, at: late.at };
  }
  return o.hoursDiffer ? { kind: 'hours' } : null;
}

function eggReason(plan: NowPlan, t: number, saveEgg: string | null, grace: number): StaleReason | null {
  if (!saveEgg || !plan.legs?.length) return null;
  const legs = plan.legs.slice(0, plan.chain.length);
  if (plan.planStart && t < plan.planStart) return null;
  const last = legs[legs.length - 1];
  if (!last || !(t < last.endTime)) return null;
  const planEgg = planEggAt(legs, t);
  if (!planEgg) return null;
  const near = new Set<string>([planEgg]);
  const before = planEggAt(legs, t - grace);
  if (before) near.add(before);
  for (const leg of legs)
    for (const s of leg.shifts ?? [])
      if (Number.isFinite(s.at) && Math.abs(s.at - t) <= grace) {
        if (s.egg) near.add(s.egg);
        if (s.fromEgg) near.add(s.fromEgg);
      }
  return near.has(saveEgg) ? null : { kind: 'egg', saveEgg, planEgg };
}
