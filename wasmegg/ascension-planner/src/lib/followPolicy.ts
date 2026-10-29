/**
 * THE FIRST ANSWER BECOMES THE FOLLOW (Jordan, 24 Oct 2026; `AUTO_FOLLOW_FIRST` gates all of it; was
 * AUTO_FOLLOW_RESULT, 23 Oct 2026, for results only). ONLY for Fastest to 490 (`fastest-490`) and Egg Day 2027 (`eggday-2027`)
 * (`autoFollowsGoal`): every other goal (other By a date deadlines, custom race targets) is opt-in, saved when the
 * player presses Follow (which also keeps an account well under the collector's 8 goals). When an account follows
 * NOTHING for one of those two, the first answer it gets for that goal becomes the followed route and is saved online once, like a
 * Follow press:
 *   - the instant answer (Fastest or By a date, InstantRoute.vue): the route its box leads with, as shown (Prefer
 *     fewer honoured), once the answer is finished (`instantAutoFollowOf`, source instant);
 *   - a Fast, Exact or Custom result of this save that takes over Right now on My runs (lib/searchPlan.ts
 *     `drivingPlan`: it makes the date, or drives Fastest; useNowPage, `autoFollowOf`, source fast|exact|custom).
 *
 * ONE TIME per goal: once anything is followed (a press, an automatic follow, or one read back from online), and
 * after "Use the planner's route" un-followed it on this device (`goneAt`), a new answer only ever asks ("This is a
 * better route than the one you're following…", BetterRoutePrompt.vue), never replaces it.
 *
 * Never while the saved routes are still being read (or couldn't be read on this load): a route followed on another
 * device must not be overwritten (stores/follow.ts `autoReady`, `autoFollow`).
 *
 * Right now names it "from the instant answer" or "from your Fast run" (Exact, Custom), never "your pick" (that is
 * only for a Follow press, Follow it or Restore).
 *
 * With the constant false: no automatic follow, no online write without a press, the labels as before. about.html and
 * Setup › Sharing each carry one sentence for it (the aboutPage spec pins it while true).
 */
import { CLOUD_EGG_DAY_YEAR, sourceOfLevel } from './followCloud';
import type { Driving } from './searchPlan';

export const AUTO_FOLLOW_FIRST = true;

/** The goals whose first answer becomes the follow on its own; every other goal waits for a Follow press. */
export const AUTO_FOLLOW_GOALS: readonly string[] = ['fastest-490', `eggday-${CLOUD_EGG_DAY_YEAR}`];

export function autoFollowsGoal(goalKey: string | null | undefined): boolean {
  return !!goalKey && AUTO_FOLLOW_GOALS.includes(goalKey);
}

/** What the automatic follow follows: the route and the summary a Follow press would save. */
export interface AutoFollow {
  chain: number[];
  source: 'instant' | 'fast' | 'exact' | 'custom';
  /** The answer's own id: when it was found, ms. */
  at: number;
  finish: number;
  endTE: number;
  planStart?: number;
  spareSeconds?: number;
}

/**
 * The result to follow for a goal, or null: the constant off, something followed, the result not driving (no result,
 * the instant answer drives, gone back from it), not this save's plan, or the goal un-followed on this device before
 * (`goneAt`, ms; 0: never): it was followed once, so only the prompt is left.
 */
export function autoFollowOf(o: {
  driving: Driving | null | undefined;
  /** The goal's pick is of this save ('this-save'). */
  thisSave: boolean;
  followed: boolean;
  goneAt: number;
  deadline: number | null;
  enabled?: boolean;
}): AutoFollow | null {
  if (!(o.enabled ?? AUTO_FOLLOW_FIRST) || o.followed || !o.thisSave || o.goneAt > 0) return null;
  const d = o.driving;
  const f = d?.found;
  if (!d || !f || !d.search || d.plan !== d.search || d.wentBack) return null;
  const src = sourceOfLevel(f.level);
  if (src === 'instant') return null;
  return {
    chain: [...f.chain],
    source: src,
    at: f.at,
    finish: Math.round(f.end),
    endTE: f.endTE,
    ...(Number.isFinite(f.planStart) ? { planStart: Math.floor(f.planStart) } : {}),
    ...(o.deadline ? { spareSeconds: Math.round(o.deadline - f.end) } : {}),
  };
}

/**
 * The instant answer to follow for a goal (the route its box shows), or null: the constant off, something followed,
 * the goal un-followed on this device before, no route, or (By a date) a route that isn't in time (`inTime`,
 * lib/eggDayRule.ts: Follow this route isn't offered on one either). `finish`, `planStart` and `deadline` in unix
 * seconds; `at` when the answer was worked out (ms).
 */
export function instantAutoFollowOf(o: {
  route: { chain: readonly number[]; end: number; endTE: number } | null | undefined;
  at: number;
  planStart: number | null | undefined;
  deadline: number | null | undefined;
  inTime: boolean;
  followed: boolean;
  goneAt: number;
  enabled?: boolean;
}): AutoFollow | null {
  if (!(o.enabled ?? AUTO_FOLLOW_FIRST) || o.followed || o.goneAt > 0 || !o.inTime) return null;
  const r = o.route;
  if (!r || !r.chain.length || !Number.isFinite(r.end)) return null;
  const finish = Math.round(r.end);
  return {
    chain: [...r.chain],
    source: 'instant',
    at: o.at,
    finish,
    endTE: Math.floor(r.endTE),
    ...(o.planStart && Number.isFinite(o.planStart) ? { planStart: Math.floor(o.planStart) } : {}),
    ...(o.deadline ? { spareSeconds: Math.round(o.deadline - r.end) } : {}),
  };
}

/** Right now's words for a followed route: "your pick" for a Follow press (Follow it, Restore), "from the instant
 *  answer" or "from your Fast run" (Exact, Custom) for one that became the follow on its own. */
export function followedLabel(f: { auto?: boolean; source?: string } | null | undefined): string {
  if (!AUTO_FOLLOW_FIRST || !f?.auto) return 'your pick';
  if (f.source === 'instant') return 'from the instant answer';
  if (f.source === 'fast' || f.source === 'exact' || f.source === 'custom')
    return `from your ${f.source[0].toUpperCase()}${f.source.slice(1)} run`;
  return 'your pick';
}
