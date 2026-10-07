/**
 * "About how many routes will this date search price?", learned as it runs.
 *
 * Up front it is sets of early stops x a typical number of routes per set (finding a set's last stop
 * takes about log2(range) + 2 tries). That typical figure was ~3x too high on a real 8,632-set run
 * (estimated ~95,000, finished at 34,913, about 4 a set), so once enough sets have finished the
 * estimate is redone from what they actually cost.
 *
 * A set is finished when its last stop is fully narrowed. Sets finish at different rounds, and the
 * cheap ones finish first, so the early average runs low; the prior pulls it back, and the routes
 * the still-open sets have already used count as a floor.
 */

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

/**
 * The up-front figure: sets of early stops x routes a set costs. The last stop is found by halving
 * its range down to one TE, plus a couple to step out and confirm (log2(span) + 2), and the span is
 * the whole reach (your TE up to 490) because a run goes past its last-stop box when the answer is
 * outside it. With fewer sets than workers each set gets several guesses a round (deadline.ts
 * `parallel`), which is more routes in fewer rounds.
 *
 * `rememberedPerSet` is what the last finished run over a big space measured here (about 4 a set on
 * an 8,632-set run); it replaces the typical figure while a set gets one guess a round. `picked` is
 * the retired "pick the stops for me" mode, which adds its seed pass on top (a fifth more).
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
  const width = Math.max(2, 490 - Math.floor(o.currentTE));
  const probes = Math.ceil(Math.log2(width)) + 2;
  const k = Math.max(1, Math.min(16, Math.floor(o.workers / n)));
  const perSet =
    k === 1 ? o.rememberedPerSet || probes : k * (Math.ceil(Math.log(width) / Math.log(k + 1)) + 1);
  return Math.round(n * perSet * (o.picked ? 1.2 : 1));
}
