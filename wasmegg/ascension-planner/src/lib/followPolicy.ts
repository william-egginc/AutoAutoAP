/**
 * A RESULT BECOMES THE FOLLOW (23 Oct 2026, waiting on Jordan's yes; `AUTO_FOLLOW_RESULT` gates all of it): on My runs,
 * Right now, a Fast, Exact or Custom result of this save that takes over from the instant answer (lib/searchPlan.ts
 * `drivingPlan`: it makes the date, or finishes sooner) while NOTHING is followed for that goal becomes the followed
 * route (source fast|exact|custom, `auto`) and is saved online once, like a Follow press. With a route followed it stays
 * the prompt ("This is a better route than the one you're following…"). Right now names it "from your Fast run", not
 * "your pick" (that is only for a Follow press, Follow it or Restore).
 *
 * Not again after "Use the checked route" for that goal (un-followed after the result was found), nor while the saved
 * routes are still being read (or couldn't be): a route followed on another device must not be overwritten.
 *
 * With the constant false: no auto-follow, no online write from a result, the labels as before. about.html and Setup ›
 * Sharing each carry one sentence for it (the aboutPage spec pins it only while true).
 */
import { sourceOfLevel } from './followCloud';
import type { Driving } from './searchPlan';

export const AUTO_FOLLOW_RESULT = true;

/** What the auto-follow follows: the route and the summary a Follow press would save. */
export interface AutoFollow {
  chain: number[];
  source: 'fast' | 'exact' | 'custom';
  /** The result's own id: when it was found, ms. */
  at: number;
  finish: number;
  endTE: number;
  planStart?: number;
  spareSeconds?: number;
}

/**
 * The result to follow for a goal, or null: the constant off, something followed, the result not driving (no result,
 * the instant answer drives, gone back from it), not this save's plan, or un-followed after the result was found
 * (`goneAt`, ms).
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
  if (!(o.enabled ?? AUTO_FOLLOW_RESULT) || o.followed || !o.thisSave) return null;
  const d = o.driving;
  const f = d?.found;
  if (!d || !f || !d.search || d.plan !== d.search || d.wentBack) return null;
  if (o.goneAt >= f.at) return null;
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

/** Right now's words for a followed route: "your pick" for a Follow press, "from your Fast run" for one that became
 *  the follow on its own. */
export function followedLabel(f: { auto?: boolean; source?: string } | null | undefined): string {
  if (AUTO_FOLLOW_RESULT && f?.auto && (f.source === 'fast' || f.source === 'exact' || f.source === 'custom'))
    return `from your ${f.source[0].toUpperCase()}${f.source.slice(1)} run`;
  return 'your pick';
}
