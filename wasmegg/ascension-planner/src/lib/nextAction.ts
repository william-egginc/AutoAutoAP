/**
 * THE NEXT ACTION AND THE NEXT SHIFTS (26 Oct 2026, Jordan): Right now's Next step says what to do next from the
 * ascension the player is in as simulated on the live save (lib/followSim.ts), not the table's next prestige:
 *
 *   before the ascension starts      "Prestige at <time>" (a fresh start the simulation waits for)
 *   in the build-up                  "Building up until about <time>": the time before its first shift (a leg that
 *                                    continues the ascension as it is has no build-up)
 *   between shifts                   "Shift to <egg> at <time>"
 *   after the last shift             "Prestige at <time>" (held for the hours and no-prestige days), or on the
 *                                    route's last ascension "Reach <TE> TE at <time>"
 *   nothing known                    null: Right now keeps its line from the table
 *
 * No purchases: shifts, the build-up as one stretch, and prestiges only.
 *
 * Pure: `now` and the prestige rule are parameters.
 */
import { virtueEggName } from './virtueEggs';

/** One ascension as these read it: the simulated one (`simulated`) or the table's. */
export interface ActionLeg {
  /** The stop it ends at, and the TE it reaches. */
  to: number;
  endTE?: number;
  start: number;
  end: number;
  shifts?: { at: number; egg: string }[];
  /** Simulated on the live save: exact times. */
  simulated?: boolean;
  /** search/types.ts LegSummary.buildPhaseEndTime: when its build phase ends; at its start (or absent) for a leg
   *  that continues the ascension as it is. */
  buildEnd?: number;
}

export type NextAction =
  | { kind: 'build'; until: number }
  | { kind: 'shift'; egg: string; at: number }
  | { kind: 'prestige'; at: number; te: number | null }
  | { kind: 'goal'; at: number; te: number };

const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Whether the leg builds up (it has a build phase that ends after it starts) and when that stretch ends: its
 *  first shift (or the build phase's end when it lists none). Null without one. */
function buildUntil(leg: ActionLeg): number | null {
  if (!ok(leg.buildEnd) || !(leg.buildEnd > leg.start)) return null;
  const first = (leg.shifts ?? []).find(s => ok(s.at));
  return first ? first.at : leg.buildEnd;
}

/**
 * The next action in the ascension the player is in (`leg`, simulated). `last`: it is the route's last ascension
 * (its end is the goal, no prestige). `prestigeAt`: when a prestige may happen from a moment (the player's hours and
 * no-prestige days, search/noPrestige.ts `nextPrestigeAt`); absent, at once. Null when nothing is known.
 */
export function nextAction(o: {
  now: number;
  leg: ActionLeg | null | undefined;
  last: boolean;
  prestigeAt?: (t: number) => number;
}): NextAction | null {
  const leg = o.leg;
  if (!leg || !ok(leg.start) || !ok(leg.end)) return null;
  if (o.now < leg.start) return { kind: 'prestige', at: leg.start, te: null };
  const until = buildUntil(leg);
  if (until !== null && o.now < until) return { kind: 'build', until };
  const next = (leg.shifts ?? []).find(s => ok(s.at) && s.at > o.now);
  if (next) return { kind: 'shift', egg: next.egg, at: next.at };
  const te = ok(leg.endTE) ? leg.endTE : leg.to;
  if (o.last) return { kind: 'goal', at: leg.end, te };
  return { kind: 'prestige', at: o.prestigeAt ? o.prestigeAt(leg.end) : leg.end, te };
}

/** The Next step's words: "Shift to Humility at Oct 28, 2026, 3:12 PM", "Building up until about …", "Prestige at …",
 *  "Reach 490 TE at …". `when` formats a moment (lib/displayTime.ts `showDateTime`). */
export function nextActionWords(a: NextAction, when: (t: number) => string): string {
  if (a.kind === 'build') return `Building up until about ${when(a.until)}`;
  if (a.kind === 'shift') return `Shift to ${virtueEggName(a.egg)} at ${when(a.at)}`;
  if (a.kind === 'goal') return `Reach ${a.te} TE at ${when(a.at)}`;
  return `Prestige at ${when(a.at)}`;
}
