/**
 * YOUR EGGS, "TO GOAL" PER EGG ON THE FOLLOWED PLAN (spec-myruns-goal, 13 Nov 2026; the game expert's answer,
 * ~/code/aaap-tools/notes/spec-myruns-fix2-gameexpert-answer.md). Not a result code hash input: nothing hashed
 * imports it (lib/resultCodeHash.ts). Pure, no simulator.
 *
 * AN EGG'S GOAL is the TE it holds at the plan's end (its own share; the five add up to the goal). It stops gaining TE
 * when its LAST stint on the plan ends, in the final ascension's tail (or an earlier ascension when the last one needs
 * nothing more from it). In the model that stint ends when its last threshold is crossed (+1 ms), then the plan shifts,
 * so the stint's end is the egg's goal time, with two caveats:
 *   - Awake hours on: a shift waits for the player and the egg keeps laying, so the threshold can come hours (about
 *     8 h overnight, more on no-prestige days) before the shift: approximate (`byAbout`, said to the hour).
 *   - Kindness (K3): its stint also waits out the weekly sale's end, so the stint's end is a late bound (`by`).
 * THE ORDER comes from each leg's own shift list (with hours on the search picks the best of 24 tail orders): never
 * an assumed C4, I2, R2, H2.
 * A STINT runs from a shift to the egg to the next shift (or the ascension's end). After a prestige the farm starts on
 * Curiosity (deriveNextStartState), whatever egg it prestiged on; the first ascension, when it carries on the save's
 * farm ('continue' / 'buildup'), starts on the save's egg. A shift's `fromEgg` (exact legs) names the opening egg.
 * WHICH LEGS: an exact plan's legs (`NowPlan.legs`, LegSummary.shifts: every shift of the ascension) and a simulated
 * first ascension (lib/followSim.ts `withCurrentSim`) are `full`. A table replay's legs (search/legShifts.ts, put on by
 * lib/nowPlan.ts `withTableShifts`) list only the shifts from H1 on: an egg not in them was last laid in the build,
 * which ends by the first listed shift (a late bound). A final ascension with no shifts at all (table only, no
 * replay): per-egg stints aren't known, so nothing per egg (the view keeps its plan-shift lines).
 * DONE: the egg's last stint is over (no later stint booked): "done on this plan".
 * TE SHARE: an Exact plan's final leg's `endEggs` (search/endEggs.ts `endEggsOf`); a table plan has none, so its
 * lines carry no TE.
 */
import type { NowPlan } from './nowPlan';
import type { EggViewLine } from './nextTeEgg';
import { continuesFarm } from './nextAction';
import { dateAt } from './eventWhen';
import { roundToHourIn } from './nowWords';
import { endEggsOf } from '@/search/endEggs';
import { VIRTUE_EGGS } from '@/types';
import { EGG_LINE, GOAL_EGG_DONE_WORDS, goalEggWords, type EggGoalBound } from './yourEggsWords';

/** One ascension as this file reads it. */
export interface GoalLeg {
  start: number;
  end: number;
  /** Its shifts (when, and the egg switched TO); null or empty: not known. */
  shifts: readonly { at: number; egg: string; fromEgg?: string }[] | null;
  /** The list is every shift of the ascension (exact, simulated); false: from H1 on only (a table replay). */
  full: boolean;
  /** The egg the farm opens the ascension on (used for a full list without `fromEgg`). */
  startEgg: string;
}

export type EggGoalTime = { egg: string; done: true } | { egg: string; done: false; at: number; bound: EggGoalBound };

/** The end of the egg's last stint in one leg: a time, 'none' (not laid in this leg), or null (can't tell). */
function lastStintIn(leg: GoalLeg, egg: string): { at: number; opening: boolean } | 'none' | null {
  const list = [...(leg.shifts ?? [])].filter(s => Number.isFinite(s.at)).sort((a, b) => a.at - b.at);
  if (!list.length) return leg.full ? (leg.startEgg === egg ? { at: leg.end, opening: false } : 'none') : null;
  let cur: string | null = leg.full ? (list[0].fromEgg ?? leg.startEgg) : null;
  let end: number | null = null;
  for (const s of list) {
    if (cur === egg && s.egg !== egg) end = s.at;
    cur = s.egg;
  }
  if (cur === egg) end = leg.end;
  if (end != null) return { at: end, opening: false };
  // A table replay lists shifts from H1 on: the egg was laid in the build before them.
  return leg.full ? 'none' : { at: list[0].at, opening: true };
}

/**
 * Each virtue egg's goal time on the plan (see the header); null when the final ascension's shifts aren't known (a
 * table-only plan with no replay) or there are no legs.
 */
export function eggGoalTimes(o: { legs: readonly GoalLeg[]; now: number; hours: boolean }): Record<string, EggGoalTime> | null {
  const last = o.legs[o.legs.length - 1];
  if (!last || !last.shifts?.length) return null;
  const out: Record<string, EggGoalTime> = {};
  for (const egg of VIRTUE_EGGS) {
    let found: { at: number; opening: boolean } | null = null;
    let unknown = false;
    for (let i = o.legs.length - 1; i >= 0; i--) {
      const r = lastStintIn(o.legs[i], egg);
      if (r === null) {
        unknown = true;
        break;
      }
      if (r !== 'none') {
        found = r;
        break;
      }
    }
    if (unknown) continue;
    if (!found || !(found.at > o.now)) {
      out[egg] = { egg, done: true };
      continue;
    }
    const bound: EggGoalBound = o.hours ? 'byAbout' : egg === 'kindness' || found.opening ? 'by' : 'at';
    out[egg] = { egg, done: false, at: found.at, bound };
  }
  return out;
}

/** The plan's ascensions as this file reads them: the exact legs, else the table's (lib/nowPlan.ts NowPlan). */
export function goalLegsOf(plan: NowPlan, o: { saveEgg: string | null }): GoalLeg[] {
  const n = plan.chain.length;
  const startEgg = (i: number, variant: string | null | undefined) =>
    i === 0 && continuesFarm(variant) && o.saveEgg ? o.saveEgg : 'curiosity';
  if (plan.legs)
    return plan.legs.slice(0, n).map((l, i) => ({
      start: l.startTime ?? l.endTime - l.durationSeconds,
      end: l.endTime,
      shifts: l.shifts ?? null,
      full: !l.replayed && !!l.shifts,
      startEgg: startEgg(i, l.key),
    }));
  return (plan.tableLegs ?? []).slice(0, n).map((l, i) => ({
    start: l.start,
    end: l.end,
    shifts: l.shifts ?? null,
    full: !!l.simulated,
    startEgg: startEgg(i, l.variant),
  }));
}

const KIND: Record<EggGoalBound, EggViewLine['kind']> = {
  at: EGG_LINE.goalEggAt,
  by: EGG_LINE.goalEggBy,
  byAbout: EGG_LINE.goalEggByAbout,
};

/**
 * Each egg's line in Your eggs' "to goal" view, by egg; null when the plan can't say (no per-egg time: the view keeps
 * its plan-shift lines). Times in the browser's format with the weekday (lib/eventWhen.ts `dateAt`); to the hour when
 * approximate or when the plan isn't exact (as the goal line above the eggs).
 */
export function planEggGoalLines(o: {
  plan: NowPlan;
  now: number;
  zone: string;
  /** Awake hours on (the answers priced with the player's hours). */
  hours: boolean;
  /** The save's egg (the first ascension carrying on the save's farm opens on it). */
  saveEgg: string | null;
}): Record<string, EggViewLine> | null {
  const times = eggGoalTimes({ legs: goalLegsOf(o.plan, { saveEgg: o.saveEgg }), now: o.now, hours: o.hours });
  if (!times) return null;
  const ends = o.plan.legs ? endEggsOf({ chain: o.plan.chain, legs: o.plan.legs }) : null;
  const te = (egg: string) => ends?.rows.find(r => r.egg === egg)?.te ?? null;
  const out: Record<string, EggViewLine> = {};
  for (const t of Object.values(times)) {
    if (t.done) {
      out[t.egg] = { kind: EGG_LINE.goalEggDone, text: GOAL_EGG_DONE_WORDS };
      continue;
    }
    const rounded = t.bound === 'byAbout' || !o.plan.exact;
    const when = dateAt(rounded ? roundToHourIn(t.at, o.zone) : t.at, o.now, o.zone, true);
    if (!when) continue;
    out[t.egg] = { kind: KIND[t.bound], text: goalEggWords(te(t.egg), when, t.bound) };
  }
  return out;
}
