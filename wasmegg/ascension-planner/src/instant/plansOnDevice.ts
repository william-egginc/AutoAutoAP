/**
 * Saved runs (the Auto Planner tab's list): the routes a player saved from Find a run with "Save this
 * plan", kept in localStorage only (nothing is sent anywhere).
 *
 * Joo's own storage has no history of generated plans: his IndexedDB library (lib/storage/db.ts) holds
 * only plans a player saves to it by hand, and his form cache only the current form. So this list is
 * our own.
 *
 * One list per account, under `aap-joo-plans:<hash>`, the hash being Joo's `hashID` (SHA-256 hex of the
 * player ID, as his library partitions use). A raw ID is never stored or shown: `plansKey` refuses
 * anything that is not a 64-character hex hash. Newest first, one entry per route + goal, at most 50.
 *
 * Older entries (written by "Simulate this plan" before Find a run: `simulatedAt`, goal "Race to 490",
 * no per-ascension times) are still read: `migratePlan` gives them the current shape.
 */
import type { AnswerRow } from './instantAnswer';
import { ascensionTimes, atText, dayText, inText, whenAgo } from './findRun';

export const PLANS_KEY_PREFIX = 'aap-joo-plans:';
export const PLANS_CAP = 50;
/** The race goal's name in the list (older entries said "Race to 490"). */
export const RACE_GOAL = 'Reach 490 TE';

/** Where an ascension's times come from: the instant answer's table, or the exact check. */
export type TimeKind = 'estimate' | 'exact';

export interface SavedAscension {
  /** The TE stop it ascends at. */
  to: number;
  /** Unix seconds. */
  start: number;
  end: number;
  kind: TimeKind;
  /** Exact only: the ascension's shifts (egg and unix seconds), as the check timed them. */
  shifts?: NextShift[];
}

/** The next shift, from an exact check only (never from an estimate). */
export interface NextShift {
  /** The egg shifted to ("Kindness"). */
  egg: string;
  /** Unix seconds. */
  at: number;
}

export interface PlanEntry {
  /** The route's TE stops, ending at its target. */
  chain: number[];
  /** "Reach 490 TE", "Egg Day 2027" or "By Dec 18, 2026". */
  goal: string;
  /** By a date (true) or the race to 490. */
  dated: boolean;
  /** By a date: the deadline, unix seconds. */
  deadline?: number;
  /** When it was saved, ms. */
  savedAt: number;
  /** Unix seconds the route's first ascension starts, as the answer priced it. */
  start: number;
  /** The first ascension's build ('2-sale', 'continue', ...), for Open in the planner. */
  a1: string;
  /** Each ascension's start and end, marked estimate or exact (empty on older entries). */
  ascensions: SavedAscension[];
  /** The simulator stamp the times were priced on (simVersion.ts; '' on older entries). */
  simVersion: string;
  /** The gear the times were priced on ("maxed gear", "your gear (...)", "built for your account" or
   *  "built for your exact gear"; '' on older entries). */
  gear: string;
  /** Unix seconds of the save the plan was found from (absent on older entries). */
  saveTime?: number;
  /** Race: when it reaches the target; by a date: when the last ascension is made (unix seconds). */
  finishAt?: number;
  /** Race: days to the target. */
  days?: number;
  /** By a date: the TE reached. */
  te?: number;
  /** Only with an exact check: the next shift. */
  next?: NextShift;
}

/** Storage as this module uses it (localStorage in the page; a map in specs). */
export type PlanStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The storage key for an account's hash, or null when `hash` is not a SHA-256 hex hash. */
export function plansKey(hash: string | null | undefined): string | null {
  return hash && /^[0-9a-f]{64}$/.test(hash) ? `${PLANS_KEY_PREFIX}${hash}` : null;
}

/** The route as a plain line: stops joined with arrows. */
export function routeText(chain: readonly number[]): string {
  return chain.join(' → ');
}

/** One entry per route + goal: this is what "the same" means. */
export function planId(p: Pick<PlanEntry, 'goal' | 'chain'>): string {
  return `${p.goal}|${p.chain.join(' ')}`;
}

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function isAscension(a: unknown): a is SavedAscension {
  const x = a as SavedAscension;
  return !!x && num(x.to) && num(x.start) && num(x.end) && (x.kind === 'estimate' || x.kind === 'exact');
}

const isShift = (s: unknown): s is NextShift =>
  !!s && typeof (s as NextShift).egg === 'string' && num((s as NextShift).at);

/** A stored ascension as kept: shifts only on exact ones, and only well-formed ones. */
function keptAscension(a: SavedAscension): SavedAscension {
  const { shifts, ...rest } = a;
  return a.kind === 'exact' && Array.isArray(shifts) ? { ...rest, shifts: shifts.filter(isShift).map(s => ({ egg: s.egg, at: s.at })) } : rest;
}

/**
 * A stored entry in the current shape, or null when it is broken. Older entries (Simulate this plan's:
 * `simulatedAt`, "Race to 490", no times, gear or save time) are kept, their missing fields left empty.
 */
export function migratePlan(raw: unknown): PlanEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const chain = p.chain;
  if (!Array.isArray(chain) || !chain.length || !chain.every(num)) return null;
  if (typeof p.goal !== 'string' || !num(p.start) || typeof p.a1 !== 'string') return null;
  const savedAt = num(p.savedAt) ? p.savedAt : num(p.simulatedAt) ? p.simulatedAt : null;
  if (savedAt === null) return null;
  const next = p.next as Partial<NextShift> | undefined;
  return {
    chain: [...(chain as number[])],
    goal: p.goal === 'Race to 490' ? RACE_GOAL : p.goal,
    dated: typeof p.dated === 'boolean' ? p.dated : num(p.te),
    ...(num(p.deadline) ? { deadline: p.deadline } : {}),
    savedAt,
    start: p.start,
    a1: p.a1,
    ascensions: Array.isArray(p.ascensions) ? (p.ascensions as unknown[]).filter(isAscension).map(keptAscension) : [],
    simVersion: typeof p.simVersion === 'string' ? p.simVersion : '',
    gear: typeof p.gear === 'string' ? p.gear : '',
    ...(num(p.saveTime) ? { saveTime: p.saveTime } : {}),
    ...(num(p.finishAt) ? { finishAt: p.finishAt } : {}),
    ...(num(p.days) ? { days: p.days } : {}),
    ...(num(p.te) ? { te: p.te } : {}),
    ...(next && typeof next.egg === 'string' && num(next.at) ? { next: { egg: next.egg, at: next.at } } : {}),
  };
}

/** A stored list in the current shape, broken entries and repeats left out (null or bad JSON: empty). */
export function parsePlans(raw: string | null): PlanEntry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    const out: PlanEntry[] = [];
    for (const e of list) {
      const p = migratePlan(e);
      if (p && !out.some(o => planId(o) === planId(p))) out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

/** `entry` put first; an older entry with the same route and goal dropped; at most `cap`. */
export function addPlan(list: readonly PlanEntry[], entry: PlanEntry, cap = PLANS_CAP): PlanEntry[] {
  return [entry, ...list.filter(e => planId(e) !== planId(entry))].slice(0, cap);
}

/** What Save this plan keeps beside the row. */
export interface SaveMeta {
  goal: string;
  dated: boolean;
  deadline?: number;
  a1: string;
  simVersion: string;
  gear: string;
  /** Unix seconds of the loaded save. */
  saveTime?: number;
  /** ms. */
  now?: number;
}

/** The entry for a Find a run row the player pressed Save this plan on: every time an estimate. */
export function entryFromRow(row: AnswerRow, meta: SaveMeta): PlanEntry {
  const now = meta.now ?? Date.now();
  const legs = row.route.legs;
  return {
    chain: [...row.route.chain],
    goal: meta.goal,
    dated: meta.dated,
    ...(meta.dated && meta.deadline !== undefined ? { deadline: meta.deadline } : {}),
    savedAt: now,
    start: legs[0]?.start ?? Math.floor(now / 1000),
    a1: meta.a1,
    ascensions: ascensionTimes(row.route).map(a => ({ to: a.to, start: a.start, end: a.end, kind: 'estimate' as const })),
    simVersion: meta.simVersion,
    gear: meta.gear,
    ...(meta.saveTime ? { saveTime: meta.saveTime } : {}),
    ...(meta.dated
      ? { finishAt: legs[legs.length - 1]?.end ?? row.route.end, te: row.endTE }
      : { finishAt: row.route.end, days: row.route.seconds / 86400 }),
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

function write(storage: PlanStorage | null, hash: string | null | undefined, list: PlanEntry[]): PlanEntry[] {
  const key = plansKey(hash);
  if (!storage || !key) return list;
  try {
    storage.setItem(key, JSON.stringify(list));
  } catch {
    // Full or private mode: the list is a nicety.
  }
  return list;
}

/** Add `entry` to the account's list; returns the list now kept (unchanged on a storage error). */
export function recordPlan(
  storage: PlanStorage | null,
  hash: string | null | undefined,
  entry: PlanEntry
): PlanEntry[] {
  return write(storage, hash, addPlan(readPlans(storage, hash), entry));
}

/** Replace the entry with the same `planId` in place (nothing when it is gone); returns the list now kept. */
export function updatePlan(storage: PlanStorage | null, hash: string | null | undefined, entry: PlanEntry): PlanEntry[] {
  const list = readPlans(storage, hash);
  if (!list.some(e => planId(e) === planId(entry))) return list;
  return write(storage, hash, list.map(e => (planId(e) === planId(entry) ? entry : e)));
}

/** Drop one entry (by `planId`); returns the list now kept. */
export function deletePlan(storage: PlanStorage | null, hash: string | null | undefined, id: string): PlanEntry[] {
  return write(
    storage,
    hash,
    readPlans(storage, hash).filter(e => planId(e) !== id)
  );
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

/** "Open in the planner": the saved start if it is still ahead, else now (the planner rounds to the minute). */
export function againStart(entry: Pick<PlanEntry, 'start'>, nowSeconds = Date.now() / 1000): number {
  return entry.start > nowSeconds ? entry.start : Math.ceil(nowSeconds);
}

/** True when the entry was found from a save older than the one loaded now. */
export function olderThanSave(entry: Pick<PlanEntry, 'saveTime' | 'savedAt'>, currentSave: number | undefined): boolean {
  if (!currentSave) return false;
  // Older entries have no save time: the save they came from is at latest their saving.
  const from = entry.saveTime ?? entry.savedAt / 1000;
  return from < currentSave;
}

/** A saved run's heading: "Egg Day 2027 · 247 TE" (by a date) or "Reach 490 TE · Feb 18, 2029" (race). */
export function savedTitle(entry: PlanEntry, timeZone: string): string {
  if (entry.dated) return entry.te !== undefined ? `${entry.goal} · ${entry.te} TE` : entry.goal;
  return entry.finishAt !== undefined ? `${entry.goal} · ${dayText(entry.finishAt, timeZone)}` : entry.goal;
}

/**
 * The line under a saved run: "Saved Oct 18 at 8:47 pm (13 hours ago), from your save of Oct 18 at
 * 8:35 pm", or "...: older than your current save" when the loaded save is newer; then "next: shift to
 * Kindness Oct 23 at 4:39 pm (in 4 days)" only when an exact check gave the next shift.
 */
export function savedLine(entry: PlanEntry, currentSave: number | undefined, nowSeconds: number, timeZone: string): string {
  const saved = `Saved ${whenAgo(entry.savedAt / 1000, nowSeconds, timeZone)}`;
  const head = olderThanSave(entry, currentSave)
    ? `${saved}: older than your current save`
    : entry.saveTime
      ? `${saved}, from your save of ${atText(entry.saveTime, timeZone)}`
      : saved;
  const exact = entry.next && entry.ascensions.some(a => a.kind === 'exact');
  return exact && entry.next
    ? `${head} · next: shift to ${entry.next.egg} ${atText(entry.next.at, timeZone)} (${inText(entry.next.at, nowSeconds)})`
    : head;
}
