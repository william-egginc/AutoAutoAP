/**
 * "About how many routes will this date search price?", learned as it runs.
 *
 * Up front it is sets of early stops x about 4 routes a set (`DEFAULT_PER_SET`). It used to be
 * log2(range) + 2, about 10, which was ~3x too high on a real 8,632-set run (estimated ~95,000,
 * finished at 34,913), so once enough sets have finished the estimate is redone from what they
 * actually cost. The TIME is counted in legs, not routes (see "Counted in legs" below).
 *
 * A set is finished when its last stop is fully narrowed. Sets finish at different rounds, and the
 * cheap ones finish first, so the early average runs low. So the run is not re-estimated from that
 * average: every set that has been tried says itself how many more routes it needs, from where its
 * bracket stands (deadline.ts `stillNeeded`: a gap of g needs log2 g more, one side known needs a step
 * out and then the gap it opens). Only the sets not tried yet are counted at a per-set average, and
 * that average leans on the finished sets only as they become a fair share of the run (`TRUST_SHARE`).
 *
 * On a real 32,645-set run the old figure (open sets x the early finishers' average, less what the
 * open sets had used) fell to nothing once the open sets had used more than that cheap average: the
 * total equalled the routes priced, the bar read full and the time left rose for hours.
 */
import { bandShapes, countBandShapes } from './deadline';
import { contention, workerSecondsPerChain } from './speed';
import type { DeadlineLegPlan } from './deadlineStore';

/** What the search reports: how many sets, and what the finished and the still-open ones have cost. */
export interface SetsLearned {
  sets: number;
  finishedSets: number;
  finishedRoutes: number;
  /** Routes already priced on sets that are not finished yet. */
  openRoutes: number;
  /** Routes handed out and not priced yet: work still to do, not work done. Absent on old reports. */
  inFlight?: number;
  /** Open sets with no route priced yet (each still needs a whole set's routes). */
  untouched?: number;
  /** Routes the open sets that HAVE been tried still need, from their brackets, in-flight ones
   *  included (deadline.ts `stillNeeded`). Absent on old reports, which are estimated the old way. */
  bracketNeed?: number;
  /** The round the search is in, from 0. */
  round?: number;
}

export interface RouteEstimate {
  /** Estimated routes in the whole run, never below `priced`. */
  total: number;
  /** True once the figure comes from this run's own sets rather than the first guess. */
  learned: boolean;
  /** Sets the estimate rests on (0 before it is learned). */
  basedOnSets: number;
  /** Routes a set has cost so far, smoothed (the first guess's figure before it is learned). */
  perSet: number;
  /** The up-front figure, for saying how far off it was. */
  firstGuess: number;
  /** 'brackets': worked out from where every tried set's search stands; 'finished': from the
   *  finished sets' average (a report without brackets). Absent before it is learned. */
  basis?: 'brackets' | 'finished';
}

/** The finished sets' average counts fully once this share of all sets is finished, and in proportion
 *  before that: the early finishers are the cheap ones. */
export const TRUST_SHARE = 0.25;
/** Fewer finished (or tried) sets than this say nothing yet. */
export const MIN_SETS = 20;

/** How far the finished sets' own average is trusted, 0 to 1 (`TRUST_SHARE`). */
export function finishedWeight(l: SetsLearned): number {
  if (!l.sets || l.finishedSets < MIN_SETS) return 0;
  return Math.min(1, l.finishedSets / l.sets / TRUST_SHARE);
}

/** Enough sets finished to estimate from their average alone. */
export function enoughSets(l: SetsLearned): boolean {
  return finishedWeight(l) >= 1;
}

/**
 * Re-estimate the run. `priced` is routes priced so far (as of the report `learn` came with),
 * `firstGuess` the up-front total, `learn` the search's report (undefined for a run with no sets to
 * learn from, e.g. the auto-picked mode or the first look).
 *
 * Whatever the guess, the total is never below what is priced, plus what is in flight, plus a route
 * for every set still open: a set that is not finished needs at least one more.
 */
export function estimateRoutes(priced: number, firstGuess: number, learn: SetsLearned | undefined): RouteEstimate {
  const first = Math.max(0, Math.round(firstGuess));
  if (!learn || !learn.sets)
    return { total: Math.max(first, priced), learned: false, basedOnSets: 0, perSet: 0, firstGuess: first };
  const open = Math.max(0, learn.sets - learn.finishedSets);
  const floor = priced + Math.max(learn.inFlight ?? 0, open);
  // Routes a set not tried yet will cost: the up-front figure, moved toward the finished sets' own
  // average as they become a fair share of the run.
  const prior = first ? first / learn.sets : DEFAULT_PER_SET;
  const w = finishedWeight(learn);
  const perSet = learn.finishedSets ? prior + w * (learn.finishedRoutes / learn.finishedSets - prior) : prior;
  const keep = (): RouteEstimate => ({
    // No first guess (a run saved before runs kept one): no total until there is something to go on.
    total: first ? Math.max(first, floor) : 0,
    learned: false,
    basedOnSets: 0,
    perSet,
    firstGuess: first,
  });
  if (learn.bracketNeed !== undefined) {
    const untouched = Math.max(0, Math.min(open, learn.untouched ?? 0));
    const tried = learn.sets - untouched;
    // Once a fair share has been tried (or every set has: after the first round), the brackets say it.
    if (untouched > 0 && (tried < MIN_SETS || tried / learn.sets < TRUST_SHARE)) return keep();
    return {
      total: Math.max(floor, Math.round(priced + learn.bracketNeed + untouched * perSet)),
      learned: true,
      basedOnSets: tried,
      perSet,
      firstGuess: first,
      basis: 'brackets',
    };
  }
  // An old report, without brackets: only once a fair share of sets is finished (the early finishers
  // are the cheap ones), each open set's expected cost less what it has already used.
  if (w < 1) return keep();
  const toGo = Math.max(0, open * perSet - learn.openRoutes);
  return {
    total: Math.max(floor, Math.round(priced + toGo)),
    learned: true,
    basedOnSets: learn.finishedSets,
    perSet,
    firstGuess: first,
    basis: 'finished',
  };
}

/** The bar may read past `BAR_CAP` only once the time left is under this. */
export const BAR_CAP_SECONDS = 5 * 60;
/** Where the bar waits while more than `BAR_CAP_SECONDS` are left (or the time left is not known). */
export const BAR_CAP = 95;

/**
 * A date search's progress, 0-100: done over the route total, held under 100 while running (an
 * estimate reached is not a run finished) and at `BAR_CAP` while more than a few minutes are left. A
 * full bar with 8.3 h to go was what the old route total did once it fell to the routes priced.
 */
export function deadlinePercent(done: number, total: number, secondsLeft: number | null): number {
  if (!(total > 0)) return 0;
  const pct = Math.min(99, Math.round((100 * Math.max(0, done)) / Math.max(total, done)));
  return secondsLeft !== null && secondsLeft <= BAR_CAP_SECONDS ? pct : Math.min(BAR_CAP, pct);
}

/** Round an estimate for display: "~35,000", not "~34,913". Three significant figures above 1,000. */
export function roundedRoutes(n: number): number {
  if (n < 1000) return Math.round(n);
  const digits = Math.floor(Math.log10(n)) - 1;
  const unit = 10 ** Math.max(0, digits);
  return Math.round(n / unit) * unit;
}

/** The short honest wording shown beside the count. */
export function estimateNote(e: RouteEstimate): string {
  if (!e.learned) return '';
  const guess = e.firstGuess ? `; first guess was ~${roundedRoutes(e.firstGuess).toLocaleString()}` : '';
  if (e.basis === 'brackets') return `estimated from the ${e.basedOnSets.toLocaleString()} sets tried so far${guess}`;
  return `estimated from the first ${e.basedOnSets.toLocaleString()} sets${guess}`;
}

/** Remembering the routes-per-set of a finished run, for the next one's first guess. */
export function usableRatio(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 && v <= 200 ? v : 0;
}

/** Routes a set costs when it gets one guess a round (many sets): measured at 34,913 routes over
 *  8,632 sets on a real run, about 4. The old log2(range) + 2 (about 10) was what overcounted. */
export const DEFAULT_PER_SET = 4;

/** Routes it takes to bracket one set's last stop from nothing, with `k` guesses a round: halving
 *  (log2 of the span, plus a couple to step out and confirm) for one, fewer rounds for more. */
function bracketRoutes(k: number, currentTE: number): number {
  const width = Math.max(2, 490 - Math.floor(currentTE));
  return k === 1 ? Math.ceil(Math.log2(width)) + 2 : k * (Math.ceil(Math.log(width) / Math.log(k + 1)) + 1);
}

/** Routes a set costs at this many sets and workers, once the first look has found where the answer
 *  is. With fewer sets than workers each set gets several guesses a round (deadline.ts `parallel`),
 *  which is more routes in fewer rounds. */
export function routesPerSet(o: {
  sets: number;
  workers: number;
  currentTE: number;
  rememberedPerSet?: number;
}): number {
  const n = Math.max(1, Math.floor(o.sets));
  const k = Math.max(1, Math.min(16, Math.floor(o.workers / n)));
  return k === 1 ? o.rememberedPerSet || DEFAULT_PER_SET : bracketRoutes(k, o.currentTE);
}

/**
 * The up-front route count. The first look (deadline.ts) brackets up to 24 sets spread through the
 * space from scratch, with the workers shared between them: a full bracket each. Every other set
 * starts next to the best found so far and costs `routesPerSet` (about 4). `picked` is the retired
 * "pick the stops for me" mode, which adds its seed pass on top (a fifth more).
 *
 * One function for the panel's estimate and the command line's, so the two cannot drift.
 */
export function plannedRoutes(o: {
  sets: number;
  workers: number;
  currentTE: number;
  rememberedPerSet?: number;
  picked?: boolean;
}): number {
  const n = Math.max(0, Math.floor(o.sets));
  if (!n) return 0;
  const first = Math.min(24, n);
  const kFirst = Math.max(1, Math.min(16, Math.floor(o.workers / first)));
  const total = first * bracketRoutes(kFirst, o.currentTE) + (n - first) * routesPerSet(o);
  return Math.round(total * (o.picked ? 1.2 : 1));
}

/* ------------------------------------------------------------------------------------------------ *
 * Counted in legs
 *
 * A route is not one unit of work. The first route of a set simulates its early legs, unless a set
 * that shares them was priced on the same worker (the prefix memo); every later route of that set
 * re-prices only its last leg -- while the worker's memo still holds the set's early legs. So the
 * work is front-loaded: the first round, which prices every set's first route, costs several legs a
 * route, and every round after it one. Routes x a flat cost read 2-5x long, and a rate of routes per
 * second measured in the first hour was the wrong rate for the rest. Legs are the unit that stays put.
 *
 * "While the memo still holds them" is the catch. Each worker comes back to the early legs of every
 * set it was dealt, once a round, in the same order, so a memo smaller than that loses each one just
 * before it is needed (least recently used is exactly the wrong one to drop then) and every round
 * costs like the first: measured at about 2.07 legs a route on a 32,645-set run with 19 workers, when
 * the memo held 3,000 entries and half of them were last legs nobody reads again. So a By a date run
 * sizes the memo for its sets (`deadlineMemoCapacity`), and the plan charges more than a leg a later
 * route when even that cannot hold them (`laterRouteLegs`).
 * ------------------------------------------------------------------------------------------------ */

/**
 * Heap one memo entry takes in a worker: one step's `AscensionSummary`, the `EngineState` the next
 * step starts from (a copy of the save's farm-independent state: artifact sets, soul eggs, TE) and
 * its twelve shift moments. Measured on 9 Oct in Node by the heap freed when a filled memo was
 * emptied: about 9.6 KB an entry on a small synthetic save; counted as 16 KB for a real save's bigger
 * artifact sets. (The heap grows ~3x that per new leg simulated, but that is the simulator's own
 * garbage and caches, not the memo, and it is collected.)
 */
export const MEMO_ENTRY_BYTES = 16 * 1024;
/**
 * Heap all the workers' memos may take together. Chrome gives the page and every worker of a tab one
 * shared ~4 GB heap (the pointer-compression cage); past it the tab is killed. A search worker already
 * churns ~100-240 MB of simulator garbage of its own, and 31 workers on a 32-thread PC ran out with
 * the old 3,000-entry memos (3,000 x ~10 KB, ~30 MB a worker, ~0.9 GB for 31). So the memos get a
 * fixed share, 768 MB, split between however many workers there are: at 16 KB an entry that is ~6,100
 * entries each for 8 workers, ~3,000 for 16, ~2,600 for 19 and ~1,600 for 31 -- the same memory as the
 * old memos at about 25 workers and less above that, all of it now early legs that are read again.
 * With 19 workers on the 32,645-set run each worker comes back to ~1,700 sets, ~2,000-2,500 early
 * legs when siblings share as they usually do: that fits. A space whose sets share less can need more
 * than the ceiling, and then the plan says so (`laterRouteLegs`) rather than promising a leg a route.
 */
export const MEMO_POOL_BYTES = 768 * 1024 * 1024;
/** The memo every other search keeps (search/chain.ts `DEFAULT_MEMO_CAPACITY`; a spec holds the two
 *  equal). Not imported: chain.ts brings the whole simulator, and the explorer reads this file. */
export const DEFAULT_MEMO_CAPACITY = 3000;
/** Never more than this a worker, however few workers: past it the memo is not what limits the run. */
export const MEMO_MAX_ENTRIES = 40_000;
/** Never less than this a worker: a memo that cannot hold one set's legs and a little more is no memo. */
export const MEMO_MIN_ENTRIES = 500;
/** Room over the working set: the work-stealing tail of a batch lands sets on workers that do not own
 *  them, and their legs need room too. */
export const MEMO_HEADROOM = 1.5;

/**
 * Early-leg entries one worker comes back to every round: `firstLegs` (`firstRouteLegs`, the first
 * round's legs with sharing) less each set's own last leg, over the workers.
 */
export function memoWorkingSet(o: { sets: number; firstLegs: number; workers: number }): number {
  return Math.max(0, o.firstLegs - o.sets) / Math.max(1, Math.floor(o.workers));
}

/** The most memo entries a worker may hold with `workers` of them sharing the tab (`MEMO_POOL_BYTES`). */
export function memoCeiling(workers: number): number {
  const each = Math.floor(MEMO_POOL_BYTES / Math.max(1, Math.floor(workers)) / MEMO_ENTRY_BYTES);
  return Math.max(MEMO_MIN_ENTRIES, Math.min(MEMO_MAX_ENTRIES, each));
}

/**
 * The prefix memo a By a date worker keeps (search/chain.ts `MemoSettings.capacity`): its working set
 * with `MEMO_HEADROOM`, at least the old 3,000 where that fits, and never past `memoCeiling`.
 */
export function deadlineMemoCapacity(o: { sets: number; firstLegs: number; workers: number }): number {
  const ceiling = memoCeiling(o.workers);
  const want = Math.max(DEFAULT_MEMO_CAPACITY, Math.ceil(MEMO_HEADROOM * memoWorkingSet(o)) + 64);
  return Math.min(want, ceiling);
}

/**
 * Real legs a route after a set's first costs: 1 while the memo holds the working set; otherwise
 * about what a first route costs (`firstLegs / sets`), since least-recently-used eviction under a
 * repeating order keeps nothing that is about to be read.
 */
export function laterRouteLegs(o: { sets: number; firstLegs: number; workers: number; capacity?: number }): number {
  const capacity = o.capacity ?? deadlineMemoCapacity(o);
  if (capacity >= memoWorkingSet(o)) return 1;
  return Math.max(1, o.firstLegs / Math.max(1, o.sets));
}

/** Worker-seconds per leg until this machine has measured its own: a Full sweep chain (the board's
 *  `workerSecondsPerChain`) is its last leg plus a share of the ones before, about 1.25 legs. */
export const LEGS_PER_SWEEP_CHAIN = 1.25;

export interface LegPlan {
  /** Distinct sets of early stops. */
  sets: number;
  /** Legs for every set's first route, early legs shared as the workers share them. */
  firstLegs: number;
  /** Routes a set is expected to cost. */
  perSet: number;
  /** Routes in all. */
  routes: number;
  /** Real legs each route after a set's first costs (`laterRouteLegs`): 1 when the memo holds. */
  laterLegs: number;
  /** Legs in all: `firstLegs` plus `laterLegs` for every route after a set's first. */
  legs: number;
}

/** Past this many sets the space is not listed to count its shared legs; an average stands in. */
const LIST_LIMIT = 250_000;

/** Distinct sets of early stops in the rows (and any extra sets), or null when there are too many to
 *  list. */
export function spaceSets(
  rows: { asc: number; bands: number[][] }[],
  currentTE: number,
  lastHi: number,
  extra: number[][] = []
): number[][] | null {
  let total = extra.length;
  for (const r of rows)
    total += r.asc <= 1 ? 1 : r.bands.length === r.asc - 1 ? countBandShapes(r.bands, currentTE, lastHi) : 0;
  if (total > LIST_LIMIT) return null;
  const seen = new Set<string>();
  const out: number[][] = [];
  const add = (s: number[]) => {
    const k = s.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  };
  for (const r of rows) {
    if (r.asc <= 1) add([]);
    else if (r.bands.length === r.asc - 1) for (const s of bandShapes(r.bands, currentTE, lastHi)) add(s);
  }
  for (const s of extra) if (s.every((v, i) => v > (i ? s[i - 1] : Math.floor(currentTE)) && v < lastHi)) add(s);
  return out;
}

/**
 * The legs a set's first route costs, over the whole space. Each set's own last early leg is its own;
 * the legs before it are shared by every set that starts the same way, once per worker that prices
 * one of them. The By a date run keeps siblings (sets differing only in their last early stop) on
 * one worker (search/stickyDealer.ts), so their shared legs are priced once; legs further back are
 * shared by groups spread over the workers, about `w(1 - (1 - 1/w)^g)` workers for `g` groups.
 */
export function firstRouteLegs(sets: number[][], workers: number): number {
  const w = Math.max(1, Math.floor(workers));
  // Groups (siblings) under each shorter prefix.
  const groupsUnder = new Map<string, Set<string>>();
  const groups = new Set<string>();
  let own = 0;
  for (const s of sets) {
    // The set's own last early leg (none for a set with no early stops) and its last leg.
    own += (s.length ? 1 : 0) + 1;
    if (s.length < 2) continue;
    const g = s.slice(0, -1).join(',');
    groups.add(g);
    for (let j = 1; j < s.length - 1; j++) {
      const p = s.slice(0, j).join(',');
      let set = groupsUnder.get(p);
      if (!set) groupsUnder.set(p, (set = new Set()));
      set.add(g);
    }
  }
  let shared = groups.size;
  for (const gs of groupsUnder.values()) shared += w * (1 - (1 - 1 / w) ** gs.size);
  return own + shared;
}

/** The whole plan for a space run: sets, the first round's legs, routes and legs in all. */
export function planLegs(o: {
  sets: number[][] | null;
  /** When `sets` is null (too many to list), how many there are and their early stops. */
  count?: number;
  stops?: number;
  workers: number;
  currentTE: number;
  rememberedPerSet?: number;
}): LegPlan {
  const n = o.sets ? o.sets.length : Math.max(0, Math.floor(o.count ?? 0));
  if (!n) return { sets: 0, firstLegs: 0, perSet: 0, routes: 0, laterLegs: 1, legs: 0 };
  const firstLegs = o.sets
    ? firstRouteLegs(o.sets, o.workers)
    : n * (2 + Math.min(1, Math.max(0, (o.stops ?? 1) - 1) * 0.2));
  const routes = plannedRoutes({
    sets: n,
    workers: o.workers,
    currentTE: o.currentTE,
    rememberedPerSet: o.rememberedPerSet,
  });
  const laterLegs = laterRouteLegs({ sets: n, firstLegs, workers: o.workers });
  return {
    sets: n,
    firstLegs,
    perSet: routes / n,
    routes,
    laterLegs,
    legs: firstLegs + Math.max(0, routes - n) * laterLegs,
  };
}

/** Wall-clock seconds for `legs` on `workers` workers at `workerSecondsPerLeg` (contention included). */
export function legSeconds(legs: number, workers: number, workerSecondsPerLeg: number): number {
  const w = Math.max(1, workers);
  return (legs * workerSecondsPerLeg * contention(w)) / w;
}

/**
 * Real legs still to go: `routesLeft` routes, of which one for each set not tried yet (`untouched`)
 * is that set's first, at `firstLegs / sets` legs, and every other one `laterLegs` (measured on the
 * run once it has priced enough later routes, `laterRouteLegs` until then). Never under one leg a
 * route left: a new route always prices at least its own last leg.
 */
export function legsLeft(o: {
  routesLeft: number;
  untouched: number;
  sets: number;
  firstLegs: number;
  laterLegs: number;
}): number {
  const routesLeft = Math.max(0, o.routesLeft);
  const later = Math.max(1, o.laterLegs);
  const perFirst = Math.max(later, o.firstLegs / Math.max(1, o.sets));
  const firsts = Math.max(0, Math.min(routesLeft, o.untouched));
  return firsts * perFirst + (routesLeft - firsts) * later;
}

/** The window the live rate is measured over: long enough to smooth a round's ups and downs, short
 *  enough to follow the workers when the slider moves. */
export const RATE_WINDOW_SECONDS = 12 * 60;
/** Under this much of the window measured, the planned rate is used. */
export const RATE_MIN_SECONDS = 120;

/** The samples' last `RATE_WINDOW_SECONDS`: its length in seconds and the legs done in it. */
function rateWindow(
  samples: readonly (readonly [number, number])[],
  now: number
): { span: number; legs: number } | null {
  if (samples.length < 2) return null;
  const from = now - RATE_WINDOW_SECONDS * 1000;
  let i = 0;
  while (i < samples.length - 1 && samples[i + 1][0] <= from) i++;
  const [t0, l0] = samples[i];
  const [t1, l1] = samples[samples.length - 1];
  return { span: (t1 - t0) / 1000, legs: l1 - l0 };
}

/**
 * Legs a second over the last `RATE_WINDOW_SECONDS`, from `[unix ms, legs done]` samples (oldest
 * first), or null while there is too little to go on (under `minSeconds` of real work).
 */
export function recentLegRate(
  samples: readonly (readonly [number, number])[],
  now: number,
  minSeconds = RATE_MIN_SECONDS
): number | null {
  const w = rateWindow(samples, now);
  if (!w || w.span < minSeconds || !(w.legs > 0) || !(w.span > 0)) return null;
  return w.legs / w.span;
}

/** Real work enough for a first measured rate: two samples (`SAMPLE_EVERY_MS` apart) of real legs. */
export const FIRST_RATE_SECONDS = 5;

/**
 * The rate the time left uses, and whether it is still `measuring` (the bar's "(measuring…)").
 *
 * The full measured rate once there are `RATE_MIN_SECONDS` of real work. Before that, as soon as the
 * workers have done any real work (`FIRST_RATE_SECONDS`, the first batches of real legs), the
 * measured rate blended with the planned one by how much of those two minutes it has, and no longer
 * "measuring": a small run used to say "(measuring…)" until it was nearly over (review, 9 Oct), since
 * it never got two minutes in. With nothing real yet, the planned rate, measuring. A carried-on run's
 * replayed routes are no real work (`addLegSample`), so its clock still starts where the replay ends.
 */
export function liveLegRate(
  samples: readonly (readonly [number, number])[],
  now: number,
  planned: number | null
): { rate: number | null; measuring: boolean } {
  const full = recentLegRate(samples, now);
  if (full !== null) return { rate: full, measuring: false };
  const first = recentLegRate(samples, now, FIRST_RATE_SECONDS);
  if (first === null) return { rate: planned, measuring: true };
  if (!planned) return { rate: first, measuring: false };
  const share = Math.min(1, (rateWindow(samples, now)?.span ?? 0) / RATE_MIN_SECONDS);
  return { rate: share * first + (1 - share) * planned, measuring: false };
}

/** At most one rate sample this often. */
export const SAMPLE_EVERY_MS = 5000;

/**
 * The live rate's samples after one more report: `[now, legs simulated this session]`, at most one
 * every `SAMPLE_EVERY_MS`, two windows kept. `legsDone` counts every route priced the way the plan
 * does; `legsReplayed` is what of that came back from a carried-on run's checkpoint, which costs
 * nothing (Allan, 8 Oct: 4,000 routes replayed in seconds read as a huge speed, "about 22 min left"
 * on a run with hours to go). Until anything has really been simulated the list is just one sample
 * at the latest moment, so the rate's clock starts where the replay ends, and `recentLegRate` waits
 * for `RATE_MIN_SECONDS` of real work.
 */
export function addLegSample(
  list: readonly [number, number][],
  now: number,
  legsDone: number,
  legsReplayed = 0
): [number, number][] {
  const fresh = Math.max(0, legsDone - legsReplayed);
  if (fresh <= 0) return [[now, 0]];
  const lastAt = list.length ? list[list.length - 1][0] : 0;
  if (now - lastAt < SAMPLE_EVERY_MS) return list as [number, number][];
  const keepFrom = now - 2 * RATE_WINDOW_SECONDS * 1000;
  return [...list.filter(x => x[0] >= keepFrom), [now, fresh]];
}

/** One key per space shape (ascension counts, and each box's width and step), so a remembered
 *  routes-per-set is used again only on a space like the one it was measured on. */
export function spaceShapeKey(bandSets: readonly (readonly (readonly number[])[])[]): string {
  return bandSets
    .map(set =>
      [
        set.length + 1,
        ...set.map(b => {
          const width = b.length ? b[b.length - 1] - b[0] : 0;
          const step = b.length > 1 ? Math.round(width / (b.length - 1)) : 0;
          return `${width}/${step}`;
        }),
      ].join(':')
    )
    .sort()
    .join('|');
}

/** Worker-seconds per leg until this machine has run a deadline search of its own: the board's
 *  worker-seconds per Full sweep chain of this length, over `LEGS_PER_SWEEP_CHAIN`. */
export function fallbackWorkerSecondsPerLeg(ascensions: number, measured?: Map<number, { seconds: number }>): number {
  return workerSecondsPerChain(ascensions, measured) / LEGS_PER_SWEEP_CHAIN;
}

/**
 * A By a date space's estimate, as the panel, the command line and the Science cards all show it:
 * its sets (the boxes plus any instant-answer sets), the first round's legs with sharing, routes,
 * legs in all, and the wall-clock time at `workerSecondsPerLeg` on `workers` workers.
 */
export function byDatePlan(o: {
  rows: { asc: number; bands: number[][] }[];
  currentTE: number;
  lastHi: number;
  instantSets?: number[][];
  workers: number;
  rememberedPerSet?: number;
  workerSecondsPerLeg: number;
}): DeadlineLegPlan {
  const sets = spaceSets(o.rows, o.currentTE, o.lastHi, o.instantSets ?? []);
  let count = 0;
  let stops = 1;
  if (!sets) {
    for (const r of o.rows) {
      count += r.asc <= 1 ? 1 : r.bands.length === r.asc - 1 ? countBandShapes(r.bands, o.currentTE, o.lastHi) : 0;
      stops = Math.max(stops, r.asc - 1);
    }
  }
  const plan = planLegs({
    sets,
    count,
    stops,
    workers: o.workers,
    currentTE: o.currentTE,
    rememberedPerSet: o.rememberedPerSet,
  });
  return {
    sets: plan.sets,
    firstLegs: Math.round(plan.firstLegs),
    routes: plan.routes,
    laterLegs: plan.laterLegs,
    legs: Math.round(plan.legs),
    workerSecondsPerLeg: o.workerSecondsPerLeg,
    seconds: legSeconds(plan.legs, o.workers, o.workerSecondsPerLeg),
  };
}

/** The line under the worker count when a long By a date run was given fewer workers than every core
 *  (stores/chainSearch.ts `fitWorkersToRun`). */
export function longRunLine(workers: number): string {
  return `Long run: using ${workers} workers to stay within the browser's memory; raise it in Setup if you like.`;
}
