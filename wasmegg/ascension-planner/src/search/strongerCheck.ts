/**
 * @module strongerCheck
 * @description "Try: stronger check" (a prototype on the instant answer, the user, 11 Oct): three
 * extra things the full simulator does after Check exactly, each about making the answer harder to
 * beat.
 *
 *  a. YOUR EARLIER ROUTES. The routes this player already found for the same goal (their board runs,
 *     as My runs counts them: sent from this browser or looking like theirs from another, see
 *     search/myBoardRows.ts; saved searches and answers, the last search on this page, earlier
 *     Check exactly results) priced on the save loaded now, next to the instant answer's. A route a
 *     search found days ago can still beat what the table suggests today.
 *  b. REFINE. A small search around the best route: every route with each stop up to RADIUS TE either
 *     way, every TE, nearest first; by a date, each one's last stop bracketed (`Bracket`) to the
 *     highest that still makes the date. Capped by time (REFINE_BUDGET_SECONDS), with an estimate
 *     before it starts.
 *  c. ONE TE LOWER. By a date, when the top instant route misses the date on the player's account,
 *     the instant answer's own fastest route to one TE lower (two if that misses too), so the panel
 *     always ends on a route that makes the date.
 *
 * Pure: the component (components/auto/StrongerCheck.vue) owns the workers and the finder.
 */
import { remainingChain, type BoardRow } from '@/lib/leaderboardRank';
import type { CheckEntry } from './checkHistory';
import type { LegSummary } from './types';
import type { RunSummary } from './runLibrary';
import type { SavedAnswer } from './deadlineStore';
import { fallbackWorkerSeconds, sweepSeconds } from './speed';
import type {
  ArrivalItem,
  Candidate,
  ExpandSettings,
  FirstLeg,
  FoundRoutes,
  PolishOptions,
  Route,
} from './routeFinder';
import type { Availability } from './availabilitySchedule';

/** What the routes are for: the fastest route to a TE, or the highest TE by a date (unix second). */
export type Goal = { kind: 'fastest'; target: number } | { kind: 'date'; deadline: number };

/** How far Refine moves each stop, either way. */
export const RADIUS = 2;
/** Refine stops here, whatever its estimate said. */
export const REFINE_BUDGET_SECONDS = 600;
/** What Refine plans for: a little under the cap, so an estimate a bit low still finishes. */
export const REFINE_PLAN_SECONDS = 480;
/** Earlier routes priced at most. */
export const MAX_EARLIER = 6;
/** By a date: how many TE lower the step-down goes. */
export const STEP_DOWN_MAX = 2;
/** Two dates this close are the same goal (a date picked again lands on a slightly different minute). */
export const SAME_DEADLINE_SECONDS = 12 * 3600;
/** The highest TE there is. */
export const TOP_TE = 490;
/** A route has to be this much sooner to count as better (the simulator's own rounding is far smaller). */
export const BETTER_BY_SECONDS = 60;

export const key = (chain: readonly number[]): string => chain.join(',');

/** A route priced by the full simulator on the player's account. */
export interface Priced {
  chain: number[];
  /** Seconds from the plan start, and the unix second it ends. */
  seconds: number;
  end: number;
  /** TE at the end (above the last stop when a sale wait overshoots). */
  endTE: number;
  /** Its simulated legs, when kept (Light's at-once routes, for the row's arrow: RouteTimeline.vue). */
  legs?: LegSummary[];
}

// ------------------------------------------------------------------------------- earlier routes

/** 'board': a board run sent from this browser (GET /mine); 'board-other': one that looks like the
 *  player's (lib/myRuns.ts `isMyRun`), sent from another browser or site. */
export type EarlierSource = 'last-search' | 'board' | 'board-other' | 'saved-search' | 'saved-answer' | 'check';

export interface EarlierRoute {
  chain: number[];
  source: EarlierSource;
  /** When it was found or sent, unix ms (absent when unknown). */
  at?: number;
}

/** Each stop above the last, and the first above the player's TE. */
export function increasing(chain: readonly number[], currentTE: number): boolean {
  let prev = Math.floor(currentTE);
  for (const c of chain) {
    if (!(c > prev)) return false;
    prev = c;
  }
  return chain.length > 0;
}

/**
 * An earlier route as a route from the save loaded now: the stops already passed dropped (the board's
 * `remainingChain`), and only if what is left still fits the goal (the same target; by a date any TE
 * above the player's). Null when nothing usable is left.
 */
export function cutRoute(chain: readonly number[] | undefined, currentTE: number, goal: Goal): number[] | null {
  if (!chain?.length || !chain.every(Number.isFinite)) return null;
  const cut = remainingChain(chain, currentTE);
  if (!increasing(cut, currentTE)) return null;
  const last = cut[cut.length - 1];
  if (last > TOP_TE) return null;
  if (goal.kind === 'fastest' && last !== goal.target) return null;
  return cut;
}

const sameDate = (a: number | undefined | null, b: number) =>
  typeof a === 'number' && Math.abs(a - b) <= SAME_DEADLINE_SECONDS;

const ms = (iso: string | undefined): number | undefined => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

/** A board row made from the save loaded now: its save's TE is the player's TE now. */
export function onCurrentSave(r: Pick<BoardRow, 'backupTE' | 'currentTE'>, currentTE: number): boolean {
  const te = r.backupTE ?? r.currentTE;
  return typeof te === 'number' && Number.isFinite(te) && Math.floor(te) === Math.floor(currentTE);
}

/**
 * The player's board runs for this goal, most telling first: those made on the save loaded now, then
 * the best by the row's own result (by a date the highest TE, else the fewest days), then the newest.
 * Each is priced on the save loaded now anyway; the order only decides which make the cap.
 */
export function boardOrder(rows: readonly BoardRow[], goal: Goal, currentTE: number): BoardRow[] {
  const mine = rows.filter(r =>
    goal.kind === 'fastest' ? !r.deadline && r.finalTE === goal.target : sameDate(r.deadline, goal.deadline)
  );
  const sent = (r: BoardRow) => ms(r.receivedAt ?? r.submittedAt) ?? 0;
  const result = (a: BoardRow, b: BoardRow) =>
    goal.kind === 'fastest' ? (a.durationDays || Infinity) - (b.durationDays || Infinity) : b.finalTE - a.finalTE;
  return mine.sort(
    (a, b) =>
      Number(onCurrentSave(b, currentTE)) - Number(onCurrentSave(a, currentTE)) || result(a, b) || sent(b) - sent(a)
  );
}

export interface EarlierInput {
  goal: Goal;
  currentTE: number;
  /** The best route of the last search on this page (Fastest/Insane), with its target. */
  lastSearch?: { chain: number[]; finalTE: number } | null;
  /** The last By a date answer on this page, with its date. */
  lastDate?: { chain: number[]; deadline: number } | null;
  /** The player's board rows (search/myBoardRows.ts): /mine's marked `yours`, the look-alikes not. */
  board?: readonly BoardRow[];
  savedRuns?: readonly RunSummary[];
  savedAnswers?: readonly SavedAnswer[];
  /** This account's Check exactly history (search/checkHistory.ts), newest first. */
  history?: readonly CheckEntry[];
  /** Routes the panel prices anyway (the instant answer's rows): not listed again. */
  exclude?: readonly (readonly number[])[];
  max?: number;
}

/**
 * The player's own earlier routes for this goal, usable from the save loaded now, most telling first:
 * the last search here, then board runs (`boardOrder`), saved searches and answers, then earlier checks
 * (newest first). Each route once; none the panel prices anyway.
 */
export function earlierRoutes(o: EarlierInput): EarlierRoute[] {
  const { goal, currentTE } = o;
  const max = o.max ?? MAX_EARLIER;
  const seen = new Set((o.exclude ?? []).map(c => key(c)));
  const out: EarlierRoute[] = [];
  const add = (chain: readonly number[] | undefined, source: EarlierSource, at?: number) => {
    if (out.length >= max) return;
    const cut = cutRoute(chain, currentTE, goal);
    if (!cut || seen.has(key(cut))) return;
    seen.add(key(cut));
    out.push({ chain: cut, source, ...(at !== undefined ? { at } : {}) });
  };
  const addRow = (r: BoardRow) => add(r.chain, r.yours ? 'board' : 'board-other', ms(r.receivedAt ?? r.submittedAt));

  if (goal.kind === 'fastest') {
    if (o.lastSearch && o.lastSearch.finalTE === goal.target) add(o.lastSearch.chain, 'last-search');
    for (const r of boardOrder(o.board ?? [], goal, currentTE)) addRow(r);
    for (const r of [...(o.savedRuns ?? [])].sort((a, b) => b.savedAt - a.savedAt))
      if (r.finalTE === goal.target) add(r.bestChain, 'saved-search', r.savedAt);
    for (const h of o.history ?? [])
      if (h.mode === 'fastest' && h.target === goal.target) add(h.exact?.chain ?? h.instant.chain, 'check', h.at);
  } else {
    if (o.lastDate && sameDate(o.lastDate.deadline, goal.deadline)) add(o.lastDate.chain, 'last-search');
    for (const r of boardOrder(o.board ?? [], goal, currentTE)) addRow(r);
    for (const a of [...(o.savedAnswers ?? [])].sort((x, y) => y.savedAt - x.savedAt))
      if (sameDate(a.result.deadline, goal.deadline)) add(a.result.routes[0]?.chain, 'saved-answer', a.savedAt);
    for (const h of o.history ?? [])
      if (h.mode === 'date' && sameDate(h.deadline, goal.deadline))
        add(h.exact?.chain ?? h.instant.chain, 'check', h.at);
  }
  return out;
}

/** "your last search", "your board run, sent Oct 3 …": where an earlier route came from. */
export function sourceLabel(r: EarlierRoute, showMs: (unixMs: number) => string): string {
  const when = r.at ? showMs(r.at) : '';
  switch (r.source) {
    case 'last-search':
      return 'your last search here';
    case 'board':
      return when ? `your board run, sent ${when}` : 'your board run';
    case 'board-other':
      return when ? `your board run, sent ${when} from another browser` : 'your board run, sent from another browser';
    case 'saved-search':
      return when ? `your saved search, ${when}` : 'your saved search';
    case 'saved-answer':
      return when ? `your saved answer, ${when}` : 'your saved answer';
    case 'check':
      return when ? `your check, ${when}` : 'your earlier check';
  }
}

/**
 * Where Light's earlier routes came from, for its status line: "from your board runs (2 sent from
 * another browser) and your saved answers". '' with none.
 */
export function earlierFromText(routes: readonly EarlierRoute[]): string {
  const n = (s: EarlierSource) => routes.filter(r => r.source === s).length;
  const parts: string[] = [];
  if (n('last-search')) parts.push('your last search here');
  const here = n('board');
  const other = n('board-other');
  if (here + other) {
    const runs = here + other === 1 ? 'your board run' : 'your board runs';
    parts.push(
      !other ? runs : !here ? `${runs} sent from another browser` : `${runs}, ${other} of them sent from another browser`
    );
  }
  if (n('saved-search')) parts.push(n('saved-search') === 1 ? 'your saved search' : 'your saved searches');
  if (n('saved-answer')) parts.push(n('saved-answer') === 1 ? 'your saved answer' : 'your saved answers');
  if (n('check')) parts.push(n('check') === 1 ? 'your earlier check' : 'your earlier checks');
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `from ${list}`;
}

// ------------------------------------------------------------------------------- refine

/** The values stop `i` may take: RADIUS either way, never past the TOP_TE. */
function range(c: number, radius: number): number[] {
  const out: number[] = [];
  for (let v = c - radius; v <= c + radius; v++) if (v <= TOP_TE) out.push(v);
  return out;
}

/**
 * How many routes Refine has around `chain`. Fastest: every route with the stops before the target
 * moved by up to `radius` each (strictly increasing, the first above the player's TE), the route
 * itself not counted. By a date: the PREFIXES (every stop but the last, moved the same way, the
 * route's own included), each of which then has its last stop bracketed.
 */
export function nearbyCount(chain: readonly number[], currentTE: number, goal: Goal, radius = RADIUS): number {
  const m = chain.length - 1;
  const last = chain[m];
  if (m <= 0) return goal.kind === 'date' ? 1 : 0;
  let prev = new Map<number, number>([[Math.floor(currentTE), 1]]);
  for (let i = 0; i < m; i++) {
    const next = new Map<number, number>();
    for (const v of range(chain[i], radius)) {
      if (!(v < last)) continue;
      let n = 0;
      for (const [p, k] of prev) if (v > p) n += k;
      if (n) next.set(v, n);
    }
    prev = next;
  }
  let total = 0;
  for (const k of prev.values()) total += k;
  return goal.kind === 'fastest' ? Math.max(0, total - (increasing(chain, currentTE) ? 1 : 0)) : total;
}

/**
 * The routes (fastest) or prefixes (by a date) `nearbyCount` counts, nearest first: by how many TE
 * they move in all, then in order. At most `max` (so a long route never builds millions of them).
 * Fastest routes end at the target; by-date prefixes are the stops before the last.
 */
export function nearbyChains(
  chain: readonly number[],
  currentTE: number,
  goal: Goal,
  max: number,
  radius = RADIUS
): number[][] {
  const m = chain.length - 1;
  const last = chain[m];
  if (m <= 0) return goal.kind === 'date' ? [[]] : [];
  const out: number[][] = [];
  const floor = Math.floor(currentTE);
  const offs = new Array<number>(m).fill(0);
  // Every offset vector whose absolute values add up to exactly `d`, in order, valid ones kept.
  const walk = (i: number, left: number, prev: number): void => {
    if (out.length >= max) return;
    if (i === m) {
      if (left === 0) out.push(chain.slice(0, m).map((c, j) => c + offs[j]));
      return;
    }
    // What the stops after this one can still take up.
    const room = (m - i - 1) * radius;
    for (let o = -radius; o <= radius; o++) {
      const a = Math.abs(o);
      if (a > left || left - a > room) continue;
      const v = chain[i] + o;
      if (!(v > prev) || !(v < last) || v > TOP_TE) continue;
      offs[i] = o;
      walk(i + 1, left - a, v);
      if (out.length >= max) return;
    }
    offs[i] = 0;
  };
  for (let d = goal.kind === 'fastest' ? 1 : 0; d <= m * radius && out.length < max; d++) walk(0, d, floor);
  return goal.kind === 'fastest' ? out.map(p => [...p, last]) : out;
}

/**
 * By a date: one prefix's last stop, bracketed. It starts at the route's own last stop (`base`); while
 * it makes the date it steps up one TE, while it misses it steps down one, never past `radius` from
 * `base`, the TOP_TE, or the prefix's own last stop. Done when the next step is known to fail or out
 * of range; its answer is the highest last stop that made it.
 */
export interface Bracket {
  prefix: number[];
  base: number;
  lo: number;
  hi: number;
  /** Last stops tried: true where the route made the date. */
  tried: Record<number, boolean>;
}

export function newBracket(prefix: number[], base: number, currentTE: number, radius = RADIUS): Bracket {
  const floor = prefix.length ? prefix[prefix.length - 1] : Math.floor(currentTE);
  return {
    prefix,
    base,
    lo: Math.max(base - radius, floor + 1),
    hi: Math.min(base + radius, TOP_TE),
    tried: {},
  };
}

/** The next last stop to try, or null when this prefix is settled. */
export function nextLast(b: Bracket): number | null {
  if (b.lo > b.hi) return null;
  const made: number[] = [];
  const missed: number[] = [];
  for (const [k, v] of Object.entries(b.tried)) (v ? made : missed).push(Number(k));
  if (!made.length && !missed.length) return Math.min(b.hi, Math.max(b.lo, b.base));
  if (made.length) {
    const n = Math.max(...made) + 1;
    return n <= b.hi && !(n in b.tried) ? n : null;
  }
  const n = Math.min(...missed) - 1;
  return n >= b.lo && !(n in b.tried) ? n : null;
}

/** The highest last stop that made the date, or null. */
export function bracketBest(b: Bracket): number | null {
  const made = Object.entries(b.tried)
    .filter(([, v]) => v)
    .map(([k]) => Number(k));
  return made.length ? Math.max(...made) : null;
}

/** Routes Refine expects to price: by a date about two a prefix (its own last stop and one step). */
export function refineRoutes(items: number, goal: Goal): number {
  return goal.kind === 'date' ? items * 2 : items;
}

/**
 * Seconds Refine takes for `items` routes (or prefixes) on `workers` workers, at `workerSeconds` per
 * route when this session has measured it, else the sweeps' figure for routes this long (speed.ts).
 */
export function refineSeconds(
  items: number,
  goal: Goal,
  ascensions: number,
  workers: number,
  workerSeconds?: number | null
): number {
  const per = workerSeconds && workerSeconds > 0 ? workerSeconds : fallbackWorkerSeconds(ascensions);
  return sweepSeconds(refineRoutes(items, goal), workers, per);
}

/** How many of `total` fit in `budget` seconds (at least one when there are any). */
export function refineFit(
  total: number,
  goal: Goal,
  ascensions: number,
  workers: number,
  workerSeconds?: number | null,
  budget = REFINE_PLAN_SECONDS
): number {
  if (total <= 0) return 0;
  const one = refineSeconds(1, goal, ascensions, workers, workerSeconds);
  return Math.max(1, Math.min(total, Math.floor(budget / Math.max(one, 1e-6))));
}

/** "under a minute", "about 4 min", "about 1.2 h". */
export function minutesText(seconds: number): string {
  if (!(seconds > 0)) return 'no time';
  if (seconds < 60) return 'under a minute';
  const m = seconds / 60;
  if (m < 90) return `about ${Math.round(m)} min`;
  return `about ${(m / 60).toFixed(1)} h`;
}

/** What Refine will do, before it starts. */
export function refineEstimateText(o: {
  goal: Goal;
  total: number;
  fit: number;
  seconds: number;
  workers: number;
}): string {
  const what = o.goal.kind === 'date' ? 'route shapes' : 'routes';
  const where = `within ${RADIUS} TE of each stop (every TE${o.goal.kind === 'date' ? ', the last stop bracketed to the date' : ''})`;
  const on = `on ${o.workers} worker${o.workers === 1 ? '' : 's'}`;
  if (o.total <= 0) return `There is nothing near this route to try.`;
  if (o.fit >= o.total)
    return `Checks all ${o.total.toLocaleString()} ${what} ${where}: ${minutesText(o.seconds)} ${on}.`;
  return (
    `${o.total.toLocaleString()} ${what} are ${where}; the nearest ${o.fit.toLocaleString()} fit in ` +
    `${minutesText(o.seconds)} ${on}. It stops after ${REFINE_BUDGET_SECONDS / 60} min either way.`
  );
}

// ------------------------------------------------------------------------------- ranking

export const makesDate = (p: Priced, deadline: number): boolean => p.end <= deadline;

/** `a` beats `b`: sooner (fastest), or by a date a higher TE that makes it, then more to spare. */
export function beats(goal: Goal, a: Priced | null | undefined, b: Priced | null | undefined): boolean {
  if (!a) return false;
  if (goal.kind === 'fastest') return !b || a.end < b.end - BETTER_BY_SECONDS;
  if (!makesDate(a, goal.deadline)) return false;
  if (!b || !makesDate(b, goal.deadline)) return true;
  return a.endTE > b.endTE || (a.endTE === b.endTE && a.end < b.end - BETTER_BY_SECONDS);
}

/** The best of a list by `beats`, or null. */
export function bestOf(goal: Goal, list: readonly (Priced | null | undefined)[]): Priced | null {
  let best: Priced | null = null;
  for (const p of list)
    if (p && (goal.kind === 'fastest' || makesDate(p, goal.deadline)) && beats(goal, p, best)) best = p;
  return best;
}

/** How `a` compares to `b`, in words: "0.42 days sooner", "1 TE higher", "0.30 days more to spare". */
export function compareText(goal: Goal, a: Priced, b: Priced | null): string {
  const d = (s: number) => `${(Math.abs(s) / 86400).toFixed(2)} days`;
  if (!b) return '';
  if (goal.kind === 'fastest') {
    const gap = b.end - a.end;
    if (Math.abs(gap) < BETTER_BY_SECONDS) return 'the same';
    return gap > 0 ? `${d(gap)} sooner` : `${d(gap)} later`;
  }
  if (!makesDate(a, goal.deadline)) return `misses the date by ${d(a.end - goal.deadline)}`;
  const te = Math.floor(a.endTE) - Math.floor(b.endTE);
  if (te) return `${Math.abs(te)} TE ${te > 0 ? 'higher' : 'lower'}`;
  const gap = b.end - a.end;
  if (Math.abs(gap) < BETTER_BY_SECONDS) return 'the same';
  return gap > 0 ? `${d(gap)} more to spare` : `${d(gap)} less to spare`;
}

// ------------------------------------------------------------------------------- step-down

/** By a date: the TEs the step-down tries, one and two below the top route's, above the player's. */
export function stepDownTargets(topTE: number, currentTE: number, n = STEP_DOWN_MAX): number[] {
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const t = Math.floor(topTE) - i;
    if (t > Math.floor(currentTE)) out.push(t);
  }
  return out;
}

/**
 * What the step-down needs to ask the instant answer's finder again at a lower TE: the answer's own
 * first ascensions and workers (InstantRoute.vue keeps it with each answer it works out; an answer put
 * back from a saved one has none, and the step-down is then left to Check exactly's lower last stops).
 */
export interface FindContext {
  startTE: number;
  start: number;
  firstLegs: FirstLeg[];
  deliveryScale: number;
  hours: Availability | null;
  maxAscensions: number | null;
  expand: (items: ArrivalItem[], settings: ExpandSettings) => Promise<Candidate[]>;
  polish: (options: PolishOptions, found: FoundRoutes) => Promise<FoundRoutes>;
}

/** The finder's fastest routes to `target`, soonest first, one per number of ascensions, at most `n`. */
export function fastestFirst(found: Pick<FoundRoutes, 'byAscensions'>, n: number): Route[] {
  return found.byAscensions
    .filter((r): r is Route => !!r)
    .sort((a, b) => a.end - b.end)
    .slice(0, n);
}

/** By a date, the last stop of a route that misses lowered one TE at a time (up to `n`), for an
 *  earlier route priced on a newer save. */
export function lowerLastStops(chain: readonly number[], currentTE: number, n = STEP_DOWN_MAX): number[][] {
  const out: number[][] = [];
  const prefix = chain.slice(0, -1);
  const floor = prefix.length ? prefix[prefix.length - 1] : Math.floor(currentTE);
  for (let i = 1; i <= n; i++) {
    const t = chain[chain.length - 1] - i;
    if (t > floor) out.push([...prefix, t]);
  }
  return out;
}

// ------------------------------------------------------------------------------- drivers

/** Prices routes with the full simulator: each chain's price by `key`, null where it failed.
 *  `sameShape`: the chains differ only in their last stop (one worker can share the rest). */
export type PriceFn = (chains: number[][], sameShape: boolean) => Promise<Map<string, Priced | null>>;

/** An earlier route priced on the save loaded now. By a date, `made` is the route as priced when it
 *  makes the date, else the highest of its last stop lowered by one or two that does (null: none). */
export interface EarlierPriced {
  route: EarlierRoute;
  priced: Priced | null;
  made: Priced | null;
}

export async function priceEarlier(o: {
  goal: Goal;
  routes: readonly EarlierRoute[];
  currentTE: number;
  price: PriceFn;
}): Promise<EarlierPriced[]> {
  if (!o.routes.length) return [];
  const got = await o.price(
    o.routes.map(r => [...r.chain]),
    false
  );
  const out: EarlierPriced[] = o.routes.map(route => {
    const priced = got.get(key(route.chain)) ?? null;
    const made = o.goal.kind === 'fastest' ? priced : priced && makesDate(priced, o.goal.deadline) ? priced : null;
    return { route, priced, made };
  });
  if (o.goal.kind === 'date') {
    const deadline = o.goal.deadline;
    for (const e of out) {
      if (e.made || !e.priced) continue;
      const lower = lowerLastStops(e.route.chain, o.currentTE);
      if (!lower.length) continue;
      const again = await o.price(lower, true);
      e.made = lower.map(c => again.get(key(c)) ?? null).find(x => x && makesDate(x, deadline)) ?? null;
    }
  }
  return out;
}

/** One TE the step-down tried: the finder's routes to it, priced, and the best that made the date. */
export interface StepDownStep {
  target: number;
  tried: Priced[];
  made: Priced | null;
}

/**
 * By a date: the finder's fastest routes to one TE below the top route (`find`, soonest first),
 * priced, and on to two below if none makes the date. Stops at the first TE with one that does.
 */
export async function stepDown(o: {
  deadline: number;
  topTE: number;
  currentTE: number;
  find: (target: number) => Promise<number[][]>;
  price: PriceFn;
  shouldStop?: () => boolean;
}): Promise<StepDownStep[]> {
  const goal: Goal = { kind: 'date', deadline: o.deadline };
  const steps: StepDownStep[] = [];
  for (const target of stepDownTargets(o.topTE, o.currentTE)) {
    if (o.shouldStop?.()) break;
    const chains = await o.find(target);
    if (!chains.length) {
      steps.push({ target, tried: [], made: null });
      continue;
    }
    const got = await o.price(chains, false);
    const tried = chains.map(c => got.get(key(c)) ?? null).filter((x): x is Priced => !!x);
    const made = bestOf(goal, tried);
    steps.push({ target, tried, made });
    if (made) break;
  }
  return steps;
}

export interface RefineProgress {
  /** Routes (fastest) or route shapes (by a date) settled, of how many. */
  done: number;
  total: number;
  /** Routes priced so far. */
  priced: number;
  best: Priced;
}

export interface RefineOutcome extends RefineProgress {
  improved: boolean;
  /** Stopped before the end: asked to, or out of time. */
  stopped: boolean;
}

/**
 * Refine around `base` (priced already): `items` from `nearbyChains` (routes, or by a date prefixes),
 * `batch` at a time, nearest first. Fastest: each route priced once. By a date: each prefix's last stop
 * bracketed (`Bracket`), a round of every open prefix's next try at a time. `shouldStop` is asked
 * between rounds; the best so far stands whenever it stops.
 */
export async function refine(o: {
  goal: Goal;
  base: Priced;
  currentTE: number;
  items: readonly number[][];
  batch: number;
  price: PriceFn;
  shouldStop: () => boolean;
  onProgress?: (p: RefineProgress) => void;
}): Promise<RefineOutcome> {
  const { goal } = o;
  let best = o.base;
  let priced = 0;
  let done = 0;
  const total = o.items.length;
  const batch = Math.max(1, o.batch);
  const report = () => o.onProgress?.({ done, total, priced, best });
  const take = (p: Priced | null | undefined) => {
    if (p && beats(goal, p, best)) best = p;
  };
  report();
  for (let i = 0; i < total; i += batch) {
    if (o.shouldStop()) return { done, total, priced, best, improved: best !== o.base, stopped: true };
    const slice = o.items.slice(i, i + batch);
    if (goal.kind === 'fastest') {
      const got = await o.price(
        slice.map(c => [...c]),
        false
      );
      priced += slice.length;
      for (const c of slice) take(got.get(key(c)));
      done += slice.length;
      report();
      continue;
    }
    const baseLast = o.base.chain[o.base.chain.length - 1];
    const basePrefix = key(o.base.chain.slice(0, -1));
    const brackets = slice.map(prefix => {
      const b = newBracket([...prefix], baseLast, o.currentTE);
      // The route itself is priced already, and makes the date.
      if (key(prefix) === basePrefix && makesDate(o.base, goal.deadline)) b.tried[baseLast] = true;
      return b;
    });
    for (;;) {
      if (o.shouldStop()) {
        report();
        return { done, total, priced, best, improved: best !== o.base, stopped: true };
      }
      const tries = brackets
        .map(b => ({ b, last: nextLast(b) }))
        .filter((t): t is { b: Bracket; last: number } => t.last !== null);
      if (!tries.length) break;
      const chains = tries.map(t => [...t.b.prefix, t.last]);
      const got = await o.price(chains, true);
      priced += chains.length;
      tries.forEach((t, j) => {
        const r = got.get(key(chains[j])) ?? null;
        t.b.tried[t.last] = !!r && makesDate(r, goal.deadline);
        take(r);
      });
      report();
    }
    done += slice.length;
    report();
  }
  return { done, total, priced, best, improved: best !== o.base, stopped: false };
}

/** What the panel shows of Refine (components/auto/StrongerCheckView.vue). */
export interface RefineView {
  plan: { base: Priced; text: string } | null;
  status: 'idle' | 'running' | 'done' | 'error';
  progress: RefineProgress | null;
  outcome: RefineOutcome | null;
  /** The route the running (or last) Refine started from. */
  startBase: Priced | null;
  /** Why the button is greyed out ('' when it is not). */
  blocked: string;
  can: boolean;
  percent: number;
  timeLeft: string;
  error: string;
}
