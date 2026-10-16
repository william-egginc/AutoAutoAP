/**
 * "Follow this route" (Jordan, 16 Oct 2026; plan aaap-tools/specialists/ui-follow-plan.md, sections c to e): the
 * player picks the route Right now follows for a goal, instead of the planner's checked pick. Picked from the
 * instant answer (its lead or a count's row), a saved answer or run, a board row, or typed on Right now.
 *
 * Kept in this browser per account and goal: `aap-follow:<sha-256 of the player ID>` (lib/storage/db.ts `hashID`,
 * as lib/myKeys.ts keeps its keys), never under the ID itself, and never sent anywhere. The value maps each goal key
 * (lib/planGoals.ts `goalKeyOf`) to the route picked. Pure apart from localStorage, which may throw (a private
 * window): the pick then holds for this visit only (stores/follow.ts keeps a copy in memory).
 */
import { eggDaySeconds, nextEggDayYear } from './eggDay';
import { goalKeyOf, type GoalKey } from './planGoals';
import { remainingChain } from './leaderboardRank';
import { SAME_DEADLINE_SECONDS, TOP_TE } from '@/search/strongerCheck';

export const FOLLOW_PREFIX = 'aap-follow:';

/** Where the pick came from: the instant answer's lead, one of its counts, a board row, a saved answer or run,
 *  or typed on Right now. */
export type FollowFrom = 'answer' | 'count' | 'board' | 'saved' | 'typed';

export interface Followed {
  /** The route as picked (a board row's from its own save: Right now drops the stops already passed). */
  chain: number[];
  from: FollowFrom;
  /** When it was picked, ms. */
  at: number;
  /** Optional words about the source ("Bob's Egg Day run"). */
  label?: string;
}

export type FollowMap = Record<GoalKey, Followed>;

const okChain = (c: unknown): c is number[] =>
  Array.isArray(c) && c.length > 0 && c.every(x => typeof x === 'number' && Number.isFinite(x));

/** The account's picks, by goal key; {} when none, unreadable or no partition. */
export function readFollows(partition: string): FollowMap {
  if (!partition) return {};
  try {
    const raw = localStorage.getItem(FOLLOW_PREFIX + partition);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object') return {};
    const out: FollowMap = {};
    for (const [k, f] of Object.entries(v as Record<string, Partial<Followed>>))
      if (f && okChain(f.chain) && typeof f.at === 'number')
        out[k] = { chain: [...f.chain], from: f.from ?? 'typed', at: f.at, ...(f.label ? { label: f.label } : {}) };
    return out;
  } catch {
    return {};
  }
}

/** Keep (or with null, forget) the account's pick for one goal; returns the picks now kept. */
export function writeFollow(partition: string, goalKey: GoalKey, f: Followed | null, base?: FollowMap): FollowMap {
  if (!partition || !goalKey) return base ?? {};
  const next = { ...(base ?? readFollows(partition)) };
  if (f) next[goalKey] = { ...f, chain: [...f.chain] };
  else delete next[goalKey];
  try {
    if (Object.keys(next).length) localStorage.setItem(FOLLOW_PREFIX + partition, JSON.stringify(next));
    else localStorage.removeItem(FOLLOW_PREFIX + partition);
  } catch {
    // A private window: the pick still holds for this visit.
  }
  return next;
}

/** The next Egg Day, as Right now's goals have it. */
export function eggDayNow(nowMs = Date.now()): { year: number; at: number } {
  const year = nextEggDayYear(nowMs);
  return { year, at: eggDaySeconds(year) };
}

/** The Egg Day `deadline` is (within a few hours, as the board groups dates), or null. */
function eggDayOf(deadline: number): { year: number; at: number } | null {
  const y = new Date(deadline * 1000).getUTCFullYear();
  for (const year of [y - 1, y, y + 1]) {
    const at = eggDaySeconds(year);
    if (Math.abs(at - deadline) <= SAME_DEADLINE_SECONDS) return { year, at };
  }
  return null;
}

/** The goal key of a screen: Fastest to `target`, or By a date on `deadline` (Egg Day's own key on Egg Day). */
export function screenGoalKey(deadline: number | null | undefined, target: number, nowMs = Date.now()): GoalKey {
  if (!deadline) return goalKeyOf('fastest', target, null, eggDayNow(nowMs));
  const e = eggDayOf(deadline);
  return e ? `eggday-${e.year}` : goalKeyOf('date', target, deadline, eggDayNow(nowMs));
}

/**
 * A board row's goal: an Egg Day row goes under Egg Day <year>, another date under By a date for that date, a race
 * row under Race to its own target (490 for the race board).
 */
export function boardGoalKey(row: { deadline?: number | null; finalTE: number }): GoalKey {
  if (row.deadline) {
    const e = eggDayOf(row.deadline);
    return e ? `eggday-${e.year}` : `date-${row.deadline}`;
  }
  return `fastest-${row.finalTE}`;
}

/** Same stops in the same order. */
export function sameChain(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean {
  return !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** The followed route from the save loaded now: the stops already passed dropped (the board's `remainingChain`). */
export function followedFromNow(chain: readonly number[], currentTE: number): number[] {
  return remainingChain(chain, Math.floor(currentTE));
}

/**
 * A route typed on Right now: stops split on spaces, commas or arrows ("197 222 247", "197 → 222 → 247",
 * "197->222->247"). Each above the last, at most 490; stops at or below the TE now are dropped (passed); Fastest
 * must end on its target. `error` says what to fix in the player's words.
 */
export function parseTypedRoute(
  text: string,
  o: { currentTE: number; target: number | null }
): { chain: number[] } | { error: string } {
  const parts = (text ?? '').split(/[^0-9.]+/).filter(Boolean);
  if (!parts.length) return { error: 'Type the stops of the route, e.g. 197 222 247.' };
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isInteger(n) || n <= 0)) return { error: 'Each stop is a whole number of TE.' };
  for (let i = 1; i < nums.length; i++)
    if (nums[i] <= nums[i - 1]) return { error: 'Each stop has to be higher than the one before it.' };
  if (nums[nums.length - 1] > TOP_TE) return { error: `The last stop can be ${TOP_TE} at most.` };
  const te = Math.floor(o.currentTE);
  const chain = nums.filter(n => n > te);
  if (!chain.length) return { error: `Every stop is at or below your ${te} TE now.` };
  if (o.target != null && chain[chain.length - 1] !== o.target)
    return { error: `This race ends at ${o.target}: make that the last stop.` };
  return { chain };
}

/** "197 → 222 → 247". */
export const routeWords = (chain: readonly number[]): string => chain.join(' → ');
