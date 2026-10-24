/**
 * RIGHT NOW AFTER CHECK EXACTLY (part B of the instant-first redesign, wireframes/price-route-v2 R1 and R2, Jordan 23
 * Oct 2026). My runs' Right now follows the INSTANT answer for a goal until a Fast, Exact or Custom search has a
 * finished result for the same goal on the same save; then it follows that result, when the result is better:
 *
 *   By a date (Egg Day too)  the result makes the date (lib/eggDayRule.ts `finishesBefore`). It replaces the instant
 *                            answer even with a TE or two less: it is priced on the player's account, the instant
 *                            answer is not (Jordan's answer 1).
 *   Fastest                  the result finishes sooner than the instant answer, or at the same minute.
 *
 * Otherwise the instant answer keeps driving and the card says why in one line (`keepWords`). "Go back to the instant
 * answer" is one press away either way (useNowPage.ts).
 *
 * Where a result comes from: the chain-search store while it holds one (`liveSearchResult`, the same rule as the
 * instant card's pointer, InstantRoute.vue `searchFound`), and the instant answer's snapshot, which keeps the last
 * one as `search` (search/instantSnapshot.ts; written by InstantRoute and by My runs). Pure.
 */
import type { LegSummary } from '@/search/types';
import { finishesBefore, lateMarker, type DeadlineKind } from './eggDayRule';
import { foundLevel, type FoundLevel, type FoundResult } from './searchPointer';
import { planFromSnapshot, type NowPlan, type SnapLike } from './nowPlan';
import type { SnapMeta } from '@/search/instantSnapshot';

/** A finished search result for one goal, as the snapshot keeps it. */
export interface SnapSearch extends FoundResult {
  /** The simulator's legs on the account (shifts inside). */
  legs: LegSummary[];
  /** When it was found, ms. */
  at: number;
  /** The plan start it was priced from, unix seconds. */
  planStart: number;
}

/** What `liveSearchResult` reads of the chain-search store (InstantRoute and useNowPage hand it over). */
export interface LiveSearchInput {
  goal: 'fastest' | 'date';
  /** By a date: the goal's deadline. */
  deadline: number | null;
  /** Fastest: the goal's target. */
  target: number;
  /** The TE the loaded save has now (whole). */
  currentTE: number;
  /** A result tagged for another account than the loaded one is not this save's ('' on either side: it is). */
  ownerOk: (owner: string) => boolean;
  fastest: {
    running: boolean;
    bestDays: number;
    bestChain: readonly number[];
    bestLegs: readonly LegSummary[] | null;
    planStart: number;
    custom: boolean;
    effort: string | null | undefined;
    at: number;
    owner: string;
  };
  date: {
    running: boolean;
    result: {
      deadline: number;
      te: number;
      simple?: boolean;
      level?: string | null;
      at?: number;
      planStart: number;
      routes: readonly { chain: readonly number[]; reachAt: number; legs?: readonly LegSummary[] | null }[];
    } | null;
    owner: string;
  };
}

/** The store's finished result for this goal on this save, or null (a running search's best so far is not one). */
export function liveSearchResult(i: LiveSearchInput): SnapSearch | null {
  const te = Math.floor(i.currentTE);
  if (i.goal === 'date') {
    const r = i.date.result;
    const best = r?.routes[0];
    if (i.date.running || !r || !best || !i.deadline || r.deadline !== i.deadline) return null;
    if (Math.floor(r.te) !== te || !i.ownerOk(i.date.owner)) return null;
    return {
      level: foundLevel({ custom: !r.simple, effort: r.level }),
      chain: [...best.chain],
      end: best.reachAt,
      endTE: best.chain[best.chain.length - 1],
      legs: [...(best.legs ?? [])],
      at: r.at ?? 0,
      planStart: r.planStart,
    };
  }
  const f = i.fastest;
  const chain = f.bestChain;
  // Finite too: a run stopped before any route was priced keeps `Infinity` days (search/driver.ts `ever`).
  if (f.running || !(f.bestDays > 0) || !Number.isFinite(f.bestDays) || !chain.length) return null;
  if (chain[chain.length - 1] !== i.target || !(chain[0] > te) || !i.ownerOk(f.owner)) return null;
  return {
    level: foundLevel({ custom: f.custom, effort: f.effort }),
    chain: [...chain],
    end: f.planStart + f.bestDays * 86400,
    endTE: i.target,
    legs: [...(f.bestLegs ?? [])],
    at: f.at,
    planStart: f.planStart,
  };
}

/** The newer of two results (by when found); either may be null. */
export function newerSearch(a: SnapSearch | null | undefined, b: SnapSearch | null | undefined): SnapSearch | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.at > a.at ? b : a;
}

/** A kept result that can be read back (an older or hand-edited snapshot may hold anything). */
export function readSearch(v: unknown): SnapSearch | null {
  const s = v as SnapSearch | null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.chain) || !s.chain.length) return null;
  if (!Number.isFinite(s.end) || !Number.isFinite(s.endTE) || typeof s.at !== 'number') return null;
  if (s.level !== 'Fast' && s.level !== 'Exact' && s.level !== 'Custom') return null;
  return { ...s, legs: Array.isArray(s.legs) ? s.legs : [] };
}

/** Right now's plan from a search result: the simulator's times on the account (`exact`), `from` its level. */
export function planFromSearch(
  s: SnapSearch,
  goal: 'fastest' | 'date',
  deadline: number | null,
  common: Pick<NowPlan, 'meta' | 'whatIf'>
): NowPlan {
  return {
    goal,
    deadline: goal === 'date' ? deadline : null,
    chain: [...s.chain],
    end: s.end,
    endTE: s.endTE,
    legs: s.legs.length ? [...s.legs] : null,
    tableLegs: null,
    exact: true,
    from: { level: s.level, at: s.at },
    instantTE: null,
    calculatedAt: s.at,
    planStart: Number.isFinite(s.planStart) ? s.planStart : null,
    spareHours: goal === 'date' && deadline ? (deadline - s.end) / 3600 : null,
    runnerUpHours: null,
    runnerUp: null,
    meta: common.meta,
    whatIf: common.whatIf,
  };
}

/** Why a result does or doesn't take over from the instant answer. */
export type Takeover =
  /** By a date: it makes the date. */
  | 'makes-date'
  /** Fastest: it finishes sooner (or at the same minute). */
  | 'sooner'
  /** Fastest: the instant answer's finish is only the table's estimate, so the result, simulated on the account with
   *  the setup (hours, held shifts, time off, dates to hit), drives outright (math review 24 Oct 2026, finding 1). */
  | 'simulated'
  /** There is no instant plan for the goal to compare with: the result drives. */
  | 'no-instant'
  /** By a date: it lands after the date. The instant answer keeps driving. */
  | 'misses-date'
  /** Fastest: it finishes later than the instant answer, BOTH simulated on the account (an older snapshot's Check
   *  exactly price). The instant answer keeps driving. */
  | 'later';

/**
 * The rule at the top. `instant` null: the goal has no instant plan.
 *
 * SIMULATED AGAINST AN ESTIMATE (math review 24 Oct 2026, verified, finding 1): the instant answer's finish is the
 * table's estimate (`exact` false; every snapshot since Check exactly went, 23 Oct 2026). It leaves out time off and
 * dates to hit, and with hours on it is optimistic by days: on one account (hours 7 am to 11 pm) it said Sep 21, 2:08
 * am while its own route simulates to Sep 27, and a Fast run seeded with it reached Sep 21, 8:22 am. So a finished
 * Fast, Exact or Custom result for the same goal, save and setup drives Fastest outright ('simulated'), and "later
 * than the instant answer" is said only when both finishes are simulated ('later'). Sooner than even the estimate
 * stays 'sooner'. By a date is unchanged: one that makes the date drives, one that lands after it doesn't count.
 */
export function searchTakeover(
  instant: (Pick<NowPlan, 'end'> & Partial<Pick<NowPlan, 'exact'>>) | null,
  search: Pick<NowPlan, 'goal' | 'end' | 'deadline'>
): Takeover {
  if (search.goal === 'date') {
    if (search.deadline != null && !finishesBefore(search.end, search.deadline)) return 'misses-date';
    return instant ? 'makes-date' : 'no-instant';
  }
  if (!instant) return 'no-instant';
  if (search.end <= instant.end + 60) return 'sooner';
  return instant.exact ? 'later' : 'simulated';
}

/** Whether that reason means the result drives Right now. */
export const takesOver = (t: Takeover): boolean => t === 'makes-date' || t === 'sooner' || t === 'simulated' || t === 'no-instant';

/** "1.2 days", "22 min", "5 h" (a gap between two finishes). */
export function gapWords(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 24 * 3600) {
    const h = Math.round((s / 3600) * 10) / 10;
    return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`;
  }
  return `${(s / 86400).toFixed(1)} days`;
}

/** The pill: "from the instant answer" or "from your Fast run, on your account". */
export function sourcePill(level: FoundLevel | null): string {
  return level ? `from your ${level} run, on your account` : 'from the instant answer';
}

/**
 * The line under the pill when a result drives: why it replaced the instant answer, before "Go back to the instant
 * answer". By a date: "Makes the date on your account, so it replaces the instant answer for the same goal:"; Fastest:
 * "Finishes 1.2 days sooner than the instant answer for the same goal:" ("at the same time as" within the minute).
 */
export function replaceWords(t: Takeover, search: Pick<NowPlan, 'end'>, instant: Pick<NowPlan, 'end'> | null): string {
  if (t === 'makes-date') return 'Makes the date on your account, so it replaces the instant answer for the same goal:';
  if (t === 'simulated')
    return "Simulated on your account with your hours, time off and dates, so it replaces the instant answer's estimate for the same goal:";
  if (t === 'sooner' && instant) {
    const gap = instant.end - search.end;
    return gap < 60
      ? 'Finishes when the instant answer does, on your account, so it replaces it for the same goal:'
      : `Finishes ${gapWords(gap)} sooner than the instant answer for the same goal:`;
  }
  return '';
}

/**
 * The one line when a result does NOT take over: "Your Fast run lands after Egg Day starts, so Right now follows
 * the instant answer." / "Your Fast run finishes 22 min later than the instant answer, so Right now follows the
 * instant answer." '' otherwise.
 */
export function keepWords(t: Takeover, level: FoundLevel, search: Pick<NowPlan, 'end'>, instant: Pick<NowPlan, 'end'> | null, kind: DeadlineKind): string {
  if (t === 'misses-date') return `Your ${level} run lands ${lateMarker(kind)}, so Right now follows the instant answer.`;
  if (t === 'later' && instant)
    return `Your ${level} run finishes ${gapWords(search.end - instant.end)} later than the instant answer, so Right now follows the instant answer.`;
  return '';
}

/** One goal's plans from one snapshot: the one that drives Right now, the instant one and the search's. */
export interface Driving {
  /** The plan Right now shows (null: neither). */
  plan: NowPlan | null;
  instant: NowPlan | null;
  search: NowPlan | null;
  /** Null without a search result. */
  takeover: Takeover | null;
  /** The player pressed "Go back to the instant answer" for this result. */
  wentBack: boolean;
  /** The result itself (null without one), to keep it again after "Use your Fast run". */
  found?: SnapSearch | null;
}

/**
 * The plan a snapshot gives Right now for a goal: the search result's when it takes over (`searchTakeover`) and the
 * player hasn't gone back to the instant answer, else the instant answer's (`planFromSnapshot`). `live`: the store's
 * result for this goal, newer than the kept one (or one kept beyond the snapshot, `KeptSearch`). `back`: the result the
 * player went back from (its `at`). `meta`: the save the result was priced from, when there is no snapshot.
 */
export function drivingPlan(
  snap: SnapLike | null,
  goal: 'fastest' | 'date',
  deadline: number | null,
  o: { live?: SnapSearch | null; back?: number | null; meta?: SnapMeta | null } = {}
): Driving {
  const instant = planFromSnapshot(snap, goal, deadline);
  const found = newerSearch(readSearch(snap?.search), o.live ?? null);
  if (!found) return { plan: instant, instant, search: null, takeover: null, wentBack: false };
  const search = planFromSearch(found, goal, deadline, { meta: snap?.meta ?? instant?.meta ?? o.meta ?? null, whatIf: snap?.whatIf ?? null });
  const takeover = searchTakeover(instant, search);
  const wentBack = o.back != null && o.back === found.at && !!instant;
  return { plan: takesOver(takeover) && !wentBack ? search : instant, instant, search, takeover, wentBack, found };
}

// ------------------------------------------------------------------------- kept beyond the snapshot

/**
 * A search result KEPT for Right now beyond the instant answer's snapshot (which lasts a day): every finished Fast,
 * Exact or Custom result for a goal, with the save it was priced from, so Right now still follows it the next day
 * (`drivingPlan` decides whether it takes over, as for one in a snapshot). It stops counting when a newer save is
 * loaded (it is then an older save's plan, ranked below the new save's like any other, lib/currentAnswer.ts) or when
 * the player goes back to the instant answer (`markKeptBack`, so the same result doesn't take over again on the next
 * visit; `forgetKeptSearch` drops one). Kept in this browser: `KEPT_SEARCH_KEY`, at most
 * `MAX_KEPT_SEARCHES`, the oldest dropped.
 */
export const KEPT_SEARCH_KEY = 'aap-search-plans';
export const MAX_KEPT_SEARCHES = 30;
/** Two save times this close are the same save (lib/currentAnswer.ts SAME_SAVE_SECONDS). */
const KEPT_SAME_SAVE_SECONDS = 10 * 60;

export interface KeptSearch {
  /** search/runSaves.ts `accountOf`: a hash. */
  account: string;
  /** `target 490` or `date <unix>` (the instant answer's own goal words). */
  goal: string;
  /** The save it was priced from, unix seconds. */
  backupTime: number;
  /** The hours and time off it was priced with (search/instantSnapshot.ts SnapMeta `setup`). */
  setup?: SnapMeta['setup'];
  /** Each egg's TE in that save (for the pace chip, as a snapshot's meta). */
  teByEgg?: number[];
  search: SnapSearch;
  /** The player went back to the instant answer from this result ("Go back to the instant answer"): kept so it doesn't
   *  take over again after a reload; a newer result replaces the record and takes over. */
  back?: boolean;
}

interface KeptStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
function keptStorage(): KeptStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
const sameKept = (a: Pick<KeptSearch, 'account' | 'goal' | 'backupTime'>, b: Pick<KeptSearch, 'account' | 'goal' | 'backupTime'>) =>
  a.account === b.account && a.goal === b.goal && Math.abs(a.backupTime - b.backupTime) <= KEPT_SAME_SAVE_SECONDS;

export function readKeptSearches(st: KeptStorage | null = keptStorage()): KeptSearch[] {
  if (!st) return [];
  try {
    const v = JSON.parse(st.getItem(KEPT_SEARCH_KEY) ?? '[]') as KeptSearch[];
    return Array.isArray(v)
      ? v.filter(e => e && typeof e.account === 'string' && typeof e.goal === 'string' && Number.isFinite(e.backupTime) && !!readSearch(e.search))
      : [];
  } catch {
    return [];
  }
}

/** Keep one (a newer result for the same account, goal and save replaces the older; an older one is ignored). */
export function recordKeptSearch(e: KeptSearch, st: KeptStorage | null = keptStorage()): boolean {
  if (!st || !e.account || !readSearch(e.search)) return false;
  try {
    const list = readKeptSearches(st);
    const old = list.find(x => sameKept(x, e));
    if (old && old.search.at >= e.search.at) return false;
    const next = list.filter(x => !sameKept(x, e));
    next.push(JSON.parse(JSON.stringify(e)) as KeptSearch);
    next.sort((a, b) => a.search.at - b.search.at);
    while (next.length > MAX_KEPT_SEARCHES) next.shift();
    st.setItem(KEPT_SEARCH_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** "Go back to the instant answer": the kept result for that account, goal and save is dropped. */
export function forgetKeptSearch(k: Pick<KeptSearch, 'account' | 'goal' | 'backupTime'>, st: KeptStorage | null = keptStorage()): void {
  if (!st) return;
  try {
    st.setItem(KEPT_SEARCH_KEY, JSON.stringify(readKeptSearches(st).filter(x => !sameKept(x, k))));
  } catch {
    // this visit only
  }
}

/** "Go back to the instant answer" (`back` true) or "Use your Fast run" (false) for the kept result. */
export function markKeptBack(
  k: Pick<KeptSearch, 'account' | 'goal' | 'backupTime'>,
  back: boolean,
  st: KeptStorage | null = keptStorage()
): void {
  if (!st) return;
  try {
    const list = readKeptSearches(st).map(x => (sameKept(x, k) ? { ...x, back } : x));
    st.setItem(KEPT_SEARCH_KEY, JSON.stringify(list));
  } catch {
    // this visit only
  }
}

/** The kept result for this account, goal and save, or null. */
export function findKeptSearch(list: readonly KeptSearch[], k: Pick<KeptSearch, 'account' | 'goal' | 'backupTime'>): KeptSearch | null {
  let best: KeptSearch | null = null;
  for (const e of list) if (sameKept(e, k) && (!best || e.search.at > best.search.at)) best = e;
  return best;
}

// ------------------------------------------------------------- a new result when the player follows a route

/**
 * TWO PATHS FOR A NEW RESULT (Jordan, 23 Oct 2026, the followed route saved online, lib/followCloud.ts):
 *
 *   'takeover'  NO route followed for the goal: the instant-first rule above, unchanged (`drivingPlan`): a Fast, Exact
 *               or Custom result that makes the date (or finishes sooner) replaces the instant answer on Right now,
 *               with "Go back to the instant answer".
 *   'prompt'    a route IS followed for the goal: it is never replaced on its own. A newer result (a search's, or a
 *               new instant answer) that is better than it (`betterThanFollowed`) is OFFERED on Right now and on the
 *               result's card: "This is a better route than the one you're following (… vs …). Do you want to follow
 *               it?" with "Follow it" (a Follow press: it saves online too) and "Keep mine" (remembered per result,
 *               `KEEP_MINE_KEY`, so the same result doesn't ask again).
 */
export type NewResultPath = 'takeover' | 'prompt';
export const newResultPath = (followed: boolean): NewResultPath => (followed ? 'prompt' : 'takeover');

/** Where a route ends: when (unix seconds) and at what TE. */
export interface RouteFinish {
  end: number;
  endTE: number;
}

/**
 * The same "better" as the instant-first rule, against the followed route. Fastest: finishes sooner by at least a
 * minute. By a date: makes the date when the followed one doesn't; or both make it and it ends on more TE; or the
 * same TE with more to spare (by at least a minute). A followed route with no known finish is never beaten (nothing
 * to compare).
 */
export function betterThanFollowed(
  goal: 'fastest' | 'date',
  deadline: number | null,
  candidate: RouteFinish,
  followed: RouteFinish | null
): boolean {
  if (!followed || !Number.isFinite(followed.end) || !Number.isFinite(candidate.end)) return false;
  if (goal === 'fastest' || deadline == null) return candidate.end <= followed.end - 60;
  if (!finishesBefore(candidate.end, deadline)) return false;
  if (!finishesBefore(followed.end, deadline)) return true;
  if (candidate.endTE !== followed.endTE) return candidate.endTE > followed.endTE;
  return candidate.end <= followed.end - 60;
}

/** A result's own id for "Keep mine": the goal, where it came from, the route and (for a search) when it ends, to the
 *  minute. An instant answer's leaves the time out: it is worked out again on each visit. */
export function resultId(goalKey: string, source: string, chain: readonly number[], end: number): string {
  return `${goalKey}|${source}|${chain.join('-')}${source === 'instant' ? '' : `|${Math.round(end / 60)}`}`;
}

/** "Keep mine" pressed, per result id (this browser). */
export const KEEP_MINE_KEY = 'aap-follow-keep-mine';
const MAX_KEEP_MINE = 100;

export function readKeptMine(st: KeptStorage | null = keptStorage()): string[] {
  if (!st) return [];
  try {
    const v = JSON.parse(st.getItem(KEEP_MINE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function keepMine(id: string, st: KeptStorage | null = keptStorage()): void {
  if (!st || !id) return;
  try {
    const list = readKeptMine(st).filter(x => x !== id);
    list.push(id);
    while (list.length > MAX_KEEP_MINE) list.shift();
    st.setItem(KEEP_MINE_KEY, JSON.stringify(list));
  } catch {
    // this visit only
  }
}

/** A route's finish in the player's words: Fastest "Oct 30 at 4:00 pm"; By a date "480 TE, 5 h to spare" (or "lands
 *  after the date"). `when` formats a unix time (lib/eventWhen.ts dateAt: 12-hour). */
function finishWords(goal: 'fastest' | 'date', deadline: number | null, r: RouteFinish, when: (t: number) => string): string {
  if (goal === 'fastest' || deadline == null) return when(r.end);
  const spare = deadline - r.end;
  return finishesBefore(r.end, deadline) ? `${r.endTE} TE, ${gapWords(spare)} to spare` : `${r.endTE} TE, lands after the date`;
}

/** "This is a better route than the one you're following (Oct 30 at 4:00 pm vs Nov 1 at 9:00 am). Do you want to
 *  follow it?" */
export function betterRouteWords(
  goal: 'fastest' | 'date',
  deadline: number | null,
  candidate: RouteFinish,
  followed: RouteFinish,
  when: (t: number) => string
): string {
  const a = finishWords(goal, deadline, candidate, when);
  const b = finishWords(goal, deadline, followed, when);
  return `This is a better route than the one you're following (${a} vs ${b}). Do you want to follow it?`;
}

/**
 * AN INSTANT ANSWER NEVER PROMPTS AGAINST A PRICED FOLLOW (Jordan, 23 Oct 2026: the instant card offered "314 TE, 9.7 h
 * to spare vs 313 TE, 1.4 days to spare" against a route his own Fast run had priced; the instant answer is an
 * estimate, optimistic for his account, his Fast runs got 313 and 310). A followed route is PRICED when it came from a
 * Fast, Exact or Custom result (`source`), when it is the route of a Fast, Exact or Custom result kept for this account
 * and goal (`results`: the same route, or one with stops already passed in front), or when Right now's finish for it
 * came from a priced result (`pricedByResult`: a result's timeline, or Check exactly's). Otherwise (typed, a board row,
 * an older instant answer) it is UNPRICED, and an instant answer may still ask about it. A Fast, Exact or Custom result
 * asks against either, by `betterThanFollowed`.
 */
export function followIsPriced(o: {
  source?: string | null;
  chain: readonly number[];
  results?: readonly (readonly number[])[];
  pricedByResult?: boolean;
}): boolean {
  if (o.source === 'fast' || o.source === 'exact' || o.source === 'custom') return true;
  if (o.pricedByResult) return true;
  return (o.results ?? []).some(r => sameTail(r, o.chain));
}
/** The same route, one maybe with stops already passed in front. */
function sameTail(a: readonly number[], b: readonly number[]): boolean {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const tail = long.slice(long.length - short.length);
  return short.every((x, i) => x === tail[i]);
}
/** May a new result of this source ask about the followed route? An instant answer only about an unpriced one. */
export const mayPrompt = (candidate: FollowPrompt['source'], followedPriced: boolean): boolean =>
  candidate !== 'instant' || !followedPriced;

/**
 * A PRICED RESULT OVER AN INSTANT FOLLOW (math review 24 Oct 2026, finding 1): a Fast, Exact or Custom result asks about
 * a route followed from the instant answer that has no simulated price on the account (not `priced`) WITHOUT the
 * `betterThanFollowed` comparison: that would set a simulated finish against the table's optimistic estimate. (An
 * instant answer still never asks about a priced follow, `mayPrompt`.)
 */
export function simulatedOverEstimate(
  candidate: FollowPrompt['source'],
  followed: { priced?: boolean; source?: string | null }
): boolean {
  return candidate !== 'instant' && followed.source === 'instant' && !followed.priced;
}

/** "Your Fast run, simulated on your account, finishes Oct 30 at 4:00 pm; the route you follow is the instant answer's
 *  estimate (Oct 29 at 9:00 am). Do you want to follow it?": no "better", the two aren't priced alike. */
export function simulatedRouteWords(
  goal: 'fastest' | 'date',
  deadline: number | null,
  candidate: RouteFinish & { source: FollowPrompt['source'] },
  followed: RouteFinish | null,
  when: (t: number) => string
): string {
  const level = candidate.source[0].toUpperCase() + candidate.source.slice(1);
  const a = finishWords(goal, deadline, candidate, when);
  const verb = goal === 'fastest' || deadline == null ? 'finishes' : 'gets';
  const b = followed && Number.isFinite(followed.end) ? ` (${finishWords(goal, deadline, followed, when)})` : '';
  return `Your ${level} run, simulated on your account, ${verb} ${a}; the route you follow is the instant answer's estimate${b}. Do you want to follow it?`;
}

/** A newer, better result for a goal with a followed route: what the prompt shows and what "Follow it" follows. */
export interface FollowPrompt {
  id: string;
  words: string;
  chain: number[];
  source: 'instant' | 'fast' | 'exact' | 'custom';
  end: number;
  endTE: number;
  planStart: number | null;
}

/**
 * The prompt for a result, or null: no route followed, the same route, an instant answer against a priced follow
 * (`mayPrompt`), not newer than the follow (by when it was found against when Follow was pressed), not better
 * (`betterThanFollowed`), or "Keep mine" pressed for it already.
 */
export function followPrompt(o: {
  goalKey: string;
  goal: 'fastest' | 'date';
  deadline: number | null;
  /** `priced`: the followed route has a priced result on the account (`followIsPriced`): an instant answer never asks.
   *  `source`: where it came from (lib/followCloud.ts FollowSource). */
  followed: { chain: readonly number[]; at: number; finish: RouteFinish | null; priced?: boolean; source?: string | null } | null;
  candidate: RouteFinish & { chain: readonly number[]; at: number; source: FollowPrompt['source']; planStart?: number | null };
  keptMine: readonly string[];
  when: (t: number) => string;
}): FollowPrompt | null {
  const f = o.followed;
  const c = o.candidate;
  if (!f || !c.chain.length) return null;
  if (c.chain.length === f.chain.length && c.chain.every((x, i) => x === f.chain[i])) return null;
  if (!mayPrompt(c.source, !!f.priced)) return null;
  if (!(c.at > f.at)) return null;
  const overEstimate = simulatedOverEstimate(c.source, f);
  if (!overEstimate && !betterThanFollowed(o.goal, o.deadline, c, f.finish)) return null;
  // By a date: a route that lands after the date never counts (lib/eggDayRule.ts), estimate or not.
  if (overEstimate && o.goal === 'date' && o.deadline != null && !finishesBefore(c.end, o.deadline)) return null;
  const id = resultId(o.goalKey, c.source, c.chain, c.end);
  if (o.keptMine.includes(id)) return null;
  return {
    id,
    words: overEstimate
      ? simulatedRouteWords(o.goal, o.deadline, c, f.finish, o.when)
      : betterRouteWords(o.goal, o.deadline, c, f.finish!, o.when),
    chain: [...c.chain],
    source: c.source,
    end: c.end,
    endTE: c.endTE,
    planStart: c.planStart ?? null,
  };
}
