/**
 * "About how many routes will this date search price?", learned as it runs.
 *
 * Up front it is sets of early stops x about 4 routes a set (`DEFAULT_PER_SET`). It used to be
 * log2(range) + 2, about 10, which was ~3x too high on a real 8,632-set run (estimated ~95,000,
 * finished at 34,913), so once enough sets have finished the estimate is redone from what they
 * actually cost. The TIME is counted in legs, not routes (see "Counted in legs" below).
 *
 * A set is finished when its last stop is fully narrowed. Sets finish at different rounds, and the
 * cheap ones finish first, so the early average runs low; the prior pulls it back, and the routes
 * the still-open sets have already used count as a floor.
 */
import { bandShapes, countBandShapes } from './deadline';
import { contention, workerSecondsPerChain } from './speed';
import type { DeadlineLegPlan } from './deadlineStore';

/** What the search reports: how many sets, and what the finished and the still-open ones have cost. */
export interface SetsLearned {
  sets: number;
  finishedSets: number;
  finishedRoutes: number;
  /** Routes already tried on sets that are not finished yet. */
  openRoutes: number;
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
}

/** How many sets' worth of weight the up-front figure keeps in the average. */
export const PRIOR_WEIGHT = 25;
/** Enough finished sets to trust: at least this many, or this share of all sets. */
export const MIN_SETS = 200;
export const MIN_SHARE = 0.05;

export function enoughSets(l: SetsLearned): boolean {
  return l.finishedSets >= Math.min(MIN_SETS, Math.max(1, Math.ceil(l.sets * MIN_SHARE))) && l.finishedSets >= 20;
}

/**
 * Re-estimate the run. `priced` is routes priced so far, `firstGuess` the up-front total, `learn` the
 * search's report (undefined for a run with no sets to learn from, e.g. the auto-picked mode).
 */
export function estimateRoutes(priced: number, firstGuess: number, learn: SetsLearned | undefined): RouteEstimate {
  const first = Math.max(0, Math.round(firstGuess));
  const keep = (): RouteEstimate => ({
    total: Math.max(first, priced),
    learned: false,
    basedOnSets: 0,
    perSet: learn && learn.sets ? first / learn.sets : 0,
    firstGuess: first,
  });
  if (!learn || !learn.sets || !first || !enoughSets(learn)) return keep();
  const prior = first / learn.sets;
  const perSet = (learn.finishedRoutes + PRIOR_WEIGHT * prior) / (learn.finishedSets + PRIOR_WEIGHT);
  const open = learn.sets - learn.finishedSets;
  // Still to try: each open set's expected cost less what it has already used, never negative.
  const toGo = Math.max(0, open * perSet - learn.openRoutes);
  return {
    total: Math.max(priced, Math.round(priced + toGo)),
    learned: true,
    basedOnSets: learn.finishedSets,
    perSet,
    firstGuess: first,
  };
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
  return `estimated from the first ${e.basedOnSets.toLocaleString()} sets; first guess was ~${roundedRoutes(
    e.firstGuess
  ).toLocaleString()}`;
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
 * re-prices only its last leg. So the work is front-loaded: the first round, which prices every
 * set's first route, costs several legs a route, and every round after it one. Routes x a flat cost
 * read 2-5x long, and a rate of routes per second measured in the first hour was the wrong rate for
 * the rest. Legs are the unit that stays put.
 * ------------------------------------------------------------------------------------------------ */

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
  /** Legs in all: `firstLegs` plus one for every route after a set's first. */
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
  if (!n) return { sets: 0, firstLegs: 0, perSet: 0, routes: 0, legs: 0 };
  const firstLegs = o.sets
    ? firstRouteLegs(o.sets, o.workers)
    : n * (2 + Math.min(1, Math.max(0, (o.stops ?? 1) - 1) * 0.2));
  const routes = plannedRoutes({
    sets: n,
    workers: o.workers,
    currentTE: o.currentTE,
    rememberedPerSet: o.rememberedPerSet,
  });
  return { sets: n, firstLegs, perSet: routes / n, routes, legs: firstLegs + Math.max(0, routes - n) };
}

/** Wall-clock seconds for `legs` on `workers` workers at `workerSecondsPerLeg` (contention included). */
export function legSeconds(legs: number, workers: number, workerSecondsPerLeg: number): number {
  const w = Math.max(1, workers);
  return (legs * workerSecondsPerLeg * contention(w)) / w;
}

/**
 * Legs still to go, from routes priced so far and the (learned) route total: the first `sets`
 * routes are each set's first, at `firstLegs / sets` legs each, and every one after that is one leg.
 * Never under one leg a route left: a new route always prices at least its own last leg.
 */
export function legsLeft(o: { priced: number; routesTotal: number; sets: number; firstLegs: number }): number {
  const sets = Math.max(1, o.sets);
  const perFirst = o.firstLegs / sets;
  const routesLeft = Math.max(0, o.routesTotal - o.priced);
  const later = Math.max(0, o.routesTotal - sets);
  const left = o.priced < sets ? (sets - o.priced) * perFirst + later : routesLeft;
  return Math.max(routesLeft, left);
}

/** The window the live rate is measured over: long enough to smooth a round's ups and downs, short
 *  enough to follow the workers when the slider moves. */
export const RATE_WINDOW_SECONDS = 12 * 60;
/** Under this much of the window measured, the planned rate is used. */
export const RATE_MIN_SECONDS = 120;

/**
 * Legs a second over the last `RATE_WINDOW_SECONDS`, from `[unix ms, legs done]` samples (oldest
 * first), or null while there is too little to go on.
 */
export function recentLegRate(samples: readonly (readonly [number, number])[], now: number): number | null {
  if (samples.length < 2) return null;
  const from = now - RATE_WINDOW_SECONDS * 1000;
  let i = 0;
  while (i < samples.length - 1 && samples[i + 1][0] <= from) i++;
  const [t0, l0] = samples[i];
  const [t1, l1] = samples[samples.length - 1];
  const span = (t1 - t0) / 1000;
  if (span < RATE_MIN_SECONDS || !(l1 > l0)) return null;
  return (l1 - l0) / span;
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
    legs: Math.round(plan.legs),
    workerSecondsPerLeg: o.workerSecondsPerLeg,
    seconds: legSeconds(plan.legs, o.workers, o.workerSecondsPerLeg),
  };
}
