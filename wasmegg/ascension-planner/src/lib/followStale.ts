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
 *   emptyBuildUp  (spec-noemptybuild, 31 Oct 2026; Jordan's alt) the route's first ascension is a build-up that the
 *            answer for this save no longer takes: search/leg.ts never offers a build-up that buys nothing or ends no
 *            sooner than continue, but a route followed before that (b8aa0487 / 1e277bbd and this rule) keeps its
 *            6-shift build-up, and the egg matches, so nothing above holds. Said when the followed first ascension is a
 *            build-up none of whose shifts is behind the save yet (more than the grace), and either its own record
 *            says continue would have ended no later (LegSummary.firstLegEnds), or this save's answer finishes the same
 *            first stop by continuing, no later than the followed build-up.
 *   hours    the route was followed with other awake hours than the player's now (lib/followCloud.ts `sameHours`).
 * Times are the save's (its backup time), not the clock: a save can't show a step done after it was taken. Pure.
 */
import { planEvents, type NowPlan } from './nowPlan';
import { planEggAt } from './planPace';
import type { LegSummary } from '@/search/types';

/** How late a step may be before it counts (a save is taken now and then; the game is opened late). */
export const STALE_GRACE_SECONDS = 2 * 3600;

export type StaleReason =
  | { kind: 'egg'; saveEgg: string; planEgg: string }
  | { kind: 'overdue'; step: 'shift'; egg: string; at: number }
  | { kind: 'overdue'; step: 'prestige'; te: number; at: number }
  | { kind: 'emptyBuildUp' }
  | { kind: 'hours' };

/** This save's answer's first ascension (Right now's pick for this save): its variant ('continue', 'buildup', '2-sale',
 *  ...), its stop and when it ends (unix seconds). */
export interface AnswerFirstLeg {
  key: string | null;
  to: number | null;
  end: number | null;
}

export function followStaleness(o: {
  /** The followed route as Right now has it (its own times, not this save's simulated current ascension). */
  plan: NowPlan | null;
  /** The save: its backup time (unix seconds), the virtue egg its farm is on (null: not on virtue or not known), its
   *  whole TE. */
  save: { seconds: number; egg: string | null; te: number } | null;
  /** The route was followed with other awake hours than the player's now. */
  hoursDiffer: boolean;
  /** This save's answer's first ascension (`emptyBuildUp`); absent or null: only the follow's own record says. */
  answer?: AnswerFirstLeg | null;
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
    if (emptyBuildUp(plan, save.seconds, o.answer ?? null, grace)) return { kind: 'emptyBuildUp' };
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

/** The followed route's first ascension: its variant, end and shifts, from the exact legs or else the table's. */
function firstLegOf(plan: NowPlan): { key: string | null; end: number; shifts: { at: number }[]; ends: LegSummary['firstLegEnds'] } | null {
  const l = plan.legs?.[0];
  if (l) return { key: String(l.key), end: l.endTime, shifts: l.shifts ?? [], ends: l.firstLegEnds };
  const t = plan.tableLegs?.[0];
  if (t) return { key: t.variant ?? t.label ?? null, end: t.end, shifts: t.shifts ?? [], ends: undefined };
  return null;
}

/** A plan's first ascension as `followStaleness` reads this save's answer (`AnswerFirstLeg`); null without one. */
export function answerFirstLeg(plan: NowPlan | null | undefined): AnswerFirstLeg | null {
  const first = plan ? firstLegOf(plan) : null;
  return first && plan ? { key: first.key, to: plan.chain[0] ?? null, end: Number.isFinite(first.end) ? first.end : null } : null;
}

/** `emptyBuildUp` (see the top). */
function emptyBuildUp(plan: NowPlan, t: number, answer: AnswerFirstLeg | null, grace: number): boolean {
  const first = firstLegOf(plan);
  if (!first || first.key !== 'buildup' || !Number.isFinite(first.end) || !(t < first.end)) return false;
  // The player hasn't started the build-up (a shift of it behind the save): then it's the route they are on.
  if (first.shifts.some(s => Number.isFinite(s.at) && s.at <= t - grace)) return false;
  const cont = first.ends?.continue;
  if (typeof cont === 'number' && Number.isFinite(cont) && cont <= first.end) return true;
  return (
    !!answer &&
    answer.key === 'continue' &&
    answer.to === plan.chain[0] &&
    typeof answer.end === 'number' &&
    Number.isFinite(answer.end) &&
    answer.end <= first.end
  );
}
