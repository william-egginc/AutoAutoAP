/**
 * My runs' "which plan" switch (Jordan, 16 Oct 2026): Right now shows the saved plan of ONE goal at a time, the
 * player picks which (Race to 490 | Egg Day 2027 | By Feb 10, 2027). Saved data only: every plan here is a kept instant
 * answer snapshot, every "answer" a last checked answer, a Check exactly history entry or a saved By a date answer.
 *
 * Goal keys:
 *   fastest-<target>   Fastest to a target. "Race to <own target>" is always listed; fastest-490 besides it only when
 *                      the player's own target isn't 490 and a plan of it is kept.
 *   eggday-<year>      By a date, Egg Day of that year. Always listed.
 *   date-<unix>        By a date, another date (the deadline in unix seconds). Listed only when a plan of it is kept.
 *
 * Per goal, the plan is lib/currentAnswer.ts's (`pickGoalPlan`: current save first, then priced with the current
 * setup, then checked, then the goal's measure): no second ranking here. The default goal (`defaultGoalKey`) is
 * the one checked LAST: goals with a plan first, by their plan's tier (current save, current setup), then the
 * newest calculated time of the goal's plans and answers of the loaded save, then the list order. Pure.
 */
import { compareGoals, cardTier, isCurrentSave, newestPlanAt, pickGoalPlan, planFinish, type CardCandidate, type CardPick } from './currentAnswer';
import { lateRoutes, nearestLate } from './eggDayRule';
import type { MyRunsOpen } from './myRunsDashboard';

export type GoalKey = string;

export interface PlanGoal {
  key: GoalKey;
  goal: 'fastest' | 'date';
  /** Fastest: the target. By a date: the planner's target (part of the instant answer's key). */
  target: number;
  deadline: number | null;
  kind: 'race' | 'eggday' | 'date';
  /** The switch's words: "Race to 490", "Race to 312", "Egg Day 2027", "By Feb 10, 2027" (each date a pill of its own,
   *  named by its date: Jordan, 24 Oct 2026; was "By a date" for every one). */
  label: string;
  /** The goal named in the chain line and the calendar: "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
  name: string;
  /** Listed only when a plan of it is kept (fastest-490 beside another own target, another date). */
  optional?: boolean;
}

/** An answer kept without its times (no legs): it counts as checking the goal, never as a plan. */
export interface GoalAnswer {
  goalKey: GoalKey;
  /** ms. */
  calculatedAt: number;
  /** The save it was worked out from, unix seconds; null when not known. */
  saveSeconds: number | null;
  /** Under this save's own key (the last checked answer). */
  ownKey?: boolean;
}

export interface GoalPlans {
  goal: PlanGoal;
  /** The goal's plan (lib/currentAnswer.ts), null when none is kept. */
  pick: CardPick | null;
  /** No plan, but an answer without its times is kept ("no saved plan with its times for this goal yet"). */
  answerOnly: boolean;
  /** When the goal was last checked, ms: the newest of its plans and answers of the loaded save; 0 when never. */
  lastAt: number;
  /** By a date (Egg Day too): no plan in time, but plans that land after the date are kept (lib/eggDayRule.ts):
   *  how many, the nearest's route and how late it lands (seconds; null when not timed). Null otherwise. */
  late?: GoalLate | null;
}

/** The late plans of a goal that has none in time. */
export interface GoalLate {
  count: number;
  /** The nearest late plan's route, null when none is timed. */
  chain: number[] | null;
  seconds: number | null;
}

/** A goal's late plans when none is in time (`GoalPlans.late`), by lib/eggDayRule.ts; null with a pick or none late. */
export function goalLate(g: Pick<PlanGoal, 'deadline'>, mine: readonly CardCandidate[], pick: CardPick | null): GoalLate | null {
  if (pick || g.deadline == null) return null;
  const late = lateRoutes(mine, c => planFinish(c.plan), g.deadline);
  if (!late.length) return null;
  const near = nearestLate(late, c => planFinish(c.plan), g.deadline);
  return { count: late.length, chain: near ? [...near.item.plan.chain] : null, seconds: near ? near.seconds : null };
}

export function goalKeyOf(goal: 'fastest' | 'date', target: number, deadline: number | null, eggDay: { year: number; at: number }): GoalKey {
  if (goal === 'fastest' || !deadline) return `fastest-${target}`;
  return deadline === eggDay.at ? `eggday-${eggDay.year}` : `date-${deadline}`;
}

/**
 * The goals My runs knows: Race to the player's own target, Fastest to 490 when that target differs, Egg Day, and
 * each other date a plan was kept for. `dayWords` formats a deadline ("Mar 3, 2027").
 */
export function goalDefs(o: {
  ownTarget: number;
  raceTarget: number;
  eggDay: { year: number; at: number };
  otherDates: readonly number[];
  dayWords: (unix: number) => string;
  /** Other race targets (a followed board row's, lib/follow.ts): each a race of its own, listed when kept. */
  otherTargets?: readonly number[];
}): PlanGoal[] {
  const race = (target: number, optional: boolean): PlanGoal => ({
    key: `fastest-${target}`,
    goal: 'fastest',
    target,
    deadline: null,
    kind: 'race',
    label: `Fastest to ${target} TE`,
    name: `Fastest to ${target} TE`,
    ...(optional ? { optional } : {}),
  });
  const list: PlanGoal[] = [race(o.ownTarget, false)];
  if (o.ownTarget !== o.raceTarget) list.push(race(o.raceTarget, true));
  for (const t of [...new Set(o.otherTargets ?? [])].sort((a, b) => a - b))
    if (t !== o.ownTarget && t !== o.raceTarget) list.push(race(t, true));
  list.push({
    key: `eggday-${o.eggDay.year}`,
    goal: 'date',
    target: o.ownTarget,
    deadline: o.eggDay.at,
    kind: 'eggday',
    label: `Egg Day ${o.eggDay.year}`,
    name: `Egg Day ${o.eggDay.year}`,
  });
  for (const d of [...new Set(o.otherDates)].sort((a, b) => a - b)) {
    if (d === o.eggDay.at) continue;
    const name = `By ${o.dayWords(d)}`;
    list.push({
      key: `date-${d}`,
      goal: 'date',
      target: o.ownTarget,
      deadline: d,
      kind: 'date',
      label: name,
      name,
      optional: true,
    });
  }
  return list;
}

/**
 * Per goal, its best saved plan (lib/currentAnswer.ts `pickGoalPlan`), whether only an answer without its times is
 * kept, and when it was last checked. Optional goals without a plan are left out; the rest keep `goals`' order.
 */
export function plansByGoal(
  goals: readonly PlanGoal[],
  candidates: readonly CardCandidate[],
  answers: readonly GoalAnswer[],
  loadedSave: number,
  /** Goals kept even without a plan: the ones a route is followed for (lib/follow.ts). */
  keep: ReadonlySet<GoalKey> = new Set()
): GoalPlans[] {
  const out: GoalPlans[] = [];
  for (const g of goals) {
    const mine = candidates.filter(c => c.goalKey === g.key && c.plan.goal === g.goal);
    // By a date only a plan in time is the pick (lib/eggDayRule.ts); the late ones are said, never picked.
    const pick = pickGoalPlan(mine, loadedSave);
    const late = goalLate(g, mine, pick);
    if (!pick && !late && g.optional && !keep.has(g.key)) continue;
    const said = answers.filter(a => a.goalKey === g.key);
    const saidHere = said.filter(a => isCurrentSave(a.saveSeconds, loadedSave, a.ownKey)).map(a => a.calculatedAt);
    const planAt = mine.length ? newestPlanAt(mine, loadedSave) : 0;
    // A plan of an older save only counts when the goal has nothing of the loaded save (`newestPlanAt`).
    out.push({
      goal: g,
      pick,
      answerOnly: !pick && !late && said.length > 0,
      lastAt: Math.max(planAt, 0, ...saidHere),
      ...(late ? { late } : {}),
    });
  }
  return out;
}

/**
 * The goal Right now opens on: the one with a plan checked LAST (after the save and setup tiers, as the tiles
 * rank); with no plan anywhere, the goal last checked at all, else the first (Race).
 */
export function defaultGoalKey(list: readonly GoalPlans[], loadedSave: number): GoalKey | null {
  if (!list.length) return null;
  const order = list.map((p, i) => ({
    p,
    o: { tier: p.pick ? cardTier(p.pick.candidate, loadedSave) : 4, lastAt: p.lastAt, order: i },
  }));
  order.sort((a, b) => compareGoals(a.o, b.o));
  return order[0].p.goal.key;
}

/** The screen that works a goal out, as the tiles open theirs (`zone`: the planner's, for another date). */
export function goalOpen(g: Pick<PlanGoal, 'kind' | 'target' | 'deadline'>, zone: string): MyRunsOpen {
  if (g.kind === 'race') return { auto: 'fastest', depth: 'smart', target: g.target };
  if (g.kind === 'eggday' || !g.deadline) return { auto: 'by-date', byDate: { eggDay: true } };
  return { auto: 'by-date', byDate: { deadline: g.deadline, zone } };
}

/** Arrow keys on the switch (a radiogroup): the option to move to, wrapping; null for any other key. */
export function nextGoalIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** One option of the switch, as RightNowCard shows it. */
export interface GoalOption {
  key: GoalKey;
  kind: PlanGoal['kind'];
  label: string;
  name: string;
  deadline: number | null;
  /** 'plan': a saved plan with its times; 'late': plans kept, every one landing after the date (lib/eggDayRule.ts);
   *  'answer-only': an answer kept without them; 'none': nothing yet. */
  state: 'plan' | 'late' | 'answer-only' | 'none';
  /** State 'late': the nearest late plan (`GoalPlans.late`). */
  late?: GoalLate;
  /** The plan's calculated time, ms. */
  calculatedAt: number | null;
  /** "Work it out ›": the goal's screen. */
  open: MyRunsOpen;
  /** The player follows a route of their own for this goal (lib/follow.ts). */
  following?: boolean;
  /** With a followed route: how far its times are (the pill says it, never "no saved plan yet"). */
  follow?: GoalFollow;
}

/**
 * A FOLLOWED GOAL'S PILL (25 Oct 2026, Jordan: the Fastest to 490 TE pill said "no saved plan yet" while the line under
 * it said "Following 226 → 277 → 317 → 490 … not priced on this save yet"): with a followed route the pill says what is
 * true of that route, in the follow line's words.
 *   'timeline': priced from a kept result or the instant answer's own route; 'estimate': estimated from the instant
 *   answer's data; 'finish': only its finish kept; 'working' / 'waiting': being estimated / once the search ends;
 *   'none': no times on this save (nothing to estimate from, past the data, or the estimate failed).
 */
export interface GoalFollow {
  times: 'timeline' | 'estimate' | 'finish' | 'working' | 'waiting' | 'none';
  /** When the route lands (its last stop), unix seconds; null without times. */
  end: number | null;
  /** By a date: it lands after the date. */
  late?: boolean;
}

/** A followed route's state from Right now's follow card (useNowPage `FollowCard`) and its plan's finish. */
export function goalFollowOf(
  card: { price: 'exact' | 'instant' | 'estimate' | 'finish' | 'none'; estimating?: string; finish?: { end: number }; missesDate?: boolean },
  planEnd: number | null
): GoalFollow {
  const late = card.missesDate ? { late: true } : {};
  if (card.price === 'exact' || card.price === 'instant') return { times: 'timeline', end: planEnd, ...late };
  if (card.price === 'estimate') return { times: 'estimate', end: planEnd, ...late };
  if (card.price === 'finish') return { times: 'finish', end: card.finish?.end ?? null, ...late };
  if (card.estimating === 'working' || card.estimating === 'waiting') return { times: card.estimating, end: null };
  return { times: 'none', end: null };
}

/** A followed route with no times yet, in words: the follow line's note and the pill's (they agree). */
export function followNoTimesWords(times: 'working' | 'waiting' | 'none'): string {
  if (times === 'working') return 'working out its times';
  if (times === 'waiting') return 'its times once the search running now ends';
  return 'not priced on this save yet';
}

/** Under a followed goal's pill: "following · lands about Nov 4, 2026", "following · working out its times",
 *  "following · not priced on this save yet". `late` words: lib/eggDayRule.ts `lateMarker`. */
export function followOptionWords(f: GoalFollow, dayWords: (unix: number) => string, lateWords: string): string {
  if (f.times === 'working' || f.times === 'waiting' || f.times === 'none' || f.end == null)
    return `following · ${followNoTimesWords(f.times === 'working' || f.times === 'waiting' ? f.times : 'none')}`;
  const when = `lands ${f.times === 'estimate' ? 'about ' : ''}${dayWords(f.end)}`;
  return `following · ${when}${f.late ? `, ${lateWords}` : ''}`;
}

export function goalOptions(list: readonly GoalPlans[], zone: string): GoalOption[] {
  return list.map(p => ({
    key: p.goal.key,
    kind: p.goal.kind,
    label: p.goal.label,
    name: p.goal.name,
    deadline: p.goal.deadline,
    state: p.pick ? 'plan' : p.late ? 'late' : p.answerOnly ? 'answer-only' : 'none',
    calculatedAt: p.pick ? p.pick.candidate.plan.calculatedAt : null,
    open: goalOpen(p.goal, zone),
    ...(!p.pick && p.late ? { late: p.late } : {}),
  }));
}

/** An empty option's words: "no saved plan for this goal yet", "no saved plan with its times for this goal yet",
 *  "no saved plan in time for this goal" (state 'late': RightNowCard says which, lib/eggDayRule.ts). */
export function emptyGoalWords(state: GoalOption['state']): string {
  if (state === 'late') return 'no saved plan in time for this goal';
  return state === 'answer-only' ? 'no saved plan with its times for this goal yet' : 'no saved plan for this goal yet';
}
