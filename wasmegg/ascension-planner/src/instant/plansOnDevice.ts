/**
 * "Your plans on this device": the routes this browser sent to Joo's Auto Planner with "Simulate this
 * plan", kept in localStorage only (nothing is sent anywhere).
 *
 * Joo's own storage has no history of generated plans: his IndexedDB library (lib/storage/db.ts) holds
 * only plans a player saves to it by hand, and his form cache only the current form. So this list is
 * our own, written when Simulate is pressed.
 *
 * One list per account, under `aap-joo-plans:<hash>`, the hash being Joo's `hashID` (SHA-256 hex of the
 * player ID, as his library partitions use). A raw ID is never stored or shown: `plansKey` refuses
 * anything that is not a 64-character hex hash. Newest first, one entry per route + goal, at most 50.
 */
import type { AnswerRow } from './instantAnswer';

export const PLANS_KEY_PREFIX = 'aap-joo-plans:';
export const PLANS_CAP = 50;

export interface PlanEntry {
  /** The route's TE stops, ending at its target. */
  chain: number[];
  /** "Race to 490", "Egg Day 2027" or "By Dec 18, 2026". */
  goal: string;
  /** When Simulate was pressed, ms. */
  simulatedAt: number;
  /** Unix seconds the route's first ascension started, as the answer priced it. */
  start: number;
  /** The first ascension's build ('2-sale', 'continue', ...), for Simulate again. */
  a1: string;
  /** Race: when it reaches the target; by a date: when the last ascension is made (unix seconds). */
  finishAt?: number;
  /** Race: days to the target. */
  days?: number;
  /** By a date: the TE reached. */
  te?: number;
}

/** Storage as this module uses it (localStorage in the page; a map in specs). */
export type PlanStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The storage key for an account's hash, or null when `hash` is not a SHA-256 hex hash. */
export function plansKey(hash: string | null | undefined): string | null {
  return hash && /^[0-9a-f]{64}$/.test(hash) ? `${PLANS_KEY_PREFIX}${hash}` : null;
}

/** The route as the list shows it: stops joined with arrows. */
export function routeText(chain: readonly number[]): string {
  return chain.join(' → ');
}

function sameRoute(a: PlanEntry, b: PlanEntry): boolean {
  return a.goal === b.goal && a.chain.join(' ') === b.chain.join(' ');
}

function isEntry(e: unknown): e is PlanEntry {
  const p = e as PlanEntry;
  return (
    !!p &&
    Array.isArray(p.chain) &&
    p.chain.length > 0 &&
    p.chain.every(n => Number.isFinite(n)) &&
    typeof p.goal === 'string' &&
    Number.isFinite(p.simulatedAt) &&
    Number.isFinite(p.start) &&
    typeof p.a1 === 'string'
  );
}

/** A stored list, the broken entries left out (null or bad JSON: empty). */
export function parsePlans(raw: string | null): PlanEntry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** `entry` put first; an older entry with the same route and goal dropped; at most `cap`. */
export function addPlan(list: readonly PlanEntry[], entry: PlanEntry, cap = PLANS_CAP): PlanEntry[] {
  return [entry, ...list.filter(e => !sameRoute(e, entry))].slice(0, cap);
}

/** The entry for an instant-answer row the player pressed Simulate on. */
export function entryFromRow(row: AnswerRow, goal: string, dated: boolean, a1: string, now = Date.now()): PlanEntry {
  const legs = row.route.legs;
  const start = legs[0]?.start ?? Math.floor(now / 1000);
  return dated
    ? {
        chain: [...row.route.chain],
        goal,
        simulatedAt: now,
        start,
        a1,
        finishAt: legs[legs.length - 1]?.end ?? row.route.end,
        te: row.endTE,
      }
    : {
        chain: [...row.route.chain],
        goal,
        simulatedAt: now,
        start,
        a1,
        finishAt: row.route.end,
        days: row.route.seconds / 86400,
      };
}

/** The account's list (empty without a hash, without storage, or on any storage error). */
export function readPlans(storage: PlanStorage | null, hash: string | null | undefined): PlanEntry[] {
  const key = plansKey(hash);
  if (!storage || !key) return [];
  try {
    return parsePlans(storage.getItem(key));
  } catch {
    return [];
  }
}

/** Add `entry` to the account's list; returns the list now kept (unchanged on a storage error). */
export function recordPlan(
  storage: PlanStorage | null,
  hash: string | null | undefined,
  entry: PlanEntry
): PlanEntry[] {
  const key = plansKey(hash);
  const next = addPlan(readPlans(storage, hash), entry);
  if (!storage || !key) return next;
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Full or private mode: the list is a nicety.
  }
  return next;
}

/** Empty the account's list. */
export function clearPlans(storage: PlanStorage | null, hash: string | null | undefined): void {
  const key = plansKey(hash);
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // As above.
  }
}

/** The page's localStorage, or null where it can't be reached. */
export function browserStorage(): PlanStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** "Simulate again": the saved start if it is still ahead, else now (the planner rounds to the minute). */
export function againStart(entry: PlanEntry, nowSeconds = Date.now() / 1000): number {
  return entry.start > nowSeconds ? entry.start : Math.ceil(nowSeconds);
}
