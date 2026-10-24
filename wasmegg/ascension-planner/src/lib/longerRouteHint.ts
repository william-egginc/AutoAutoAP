/**
 * "A longer route might win": the notes under a finished Fastest result.
 *
 * Fastest never searches outside the ascension limits the player chose. Inside them Smart search now
 * settles the count itself (Fast checks each other count, driver.ts stage 4c; Exact and Very high
 * run the count probe), so on Smart search (`run` given) a note only stays for a count the run did
 * not search: one outside the limits ("...; your limit is 6"), or one a stopped run never reached.
 * The Full sweep searches the chains it was given, so it keeps every note. Two reasons, both worked
 * out here as plain arithmetic so the page only has to show them:
 *
 *   instant: the instant answer (components/auto/InstantRoute.vue) has a route that beats the
 *     search's best. It ascends on the whole hour and its whole-route time can be off by up to about
 *     a day, so a route only counts when it wins by a clear margin (`MARGIN_SECONDS`), or when it
 *     uses more ascensions than anything the search tried (the search could not have found it).
 *   edge: the search's best route uses the largest ascension count the search tried, so the answer
 *     sits at the edge and one more ascension might be faster.
 *
 * Nothing here runs or changes anything: the panels turn a note's `count` into a button that adds a
 * chain (Full sweep) or a starting chain (Smart search), and the player presses Find.
 */

/** The instant answer must beat the search by more than this (seconds) to be mentioned. */
export const MARGIN_SECONDS = 12 * 3600;
/** The most ascensions a chain row can hold (RoutesToTry's box). */
export const MAX_ASCENSIONS = 12;

export interface InstantRouteSummary {
  /** Checkpoints, ending at the target. */
  chain: number[];
  /** Seconds from the plan start to the target. */
  seconds: number;
  /** True when the full simulator priced it on the player's account (else the table's own time). */
  exact: boolean;
}

export interface LongerRouteInput {
  /** The search's best route and its time (seconds from the plan start). */
  bestChain: number[];
  bestSeconds: number;
  /** The ascension counts the search priced a chain for (any order, repeats allowed). */
  searchedCounts: readonly number[];
  /** The instant answer's fastest route for this save, or null when there is none yet. */
  instant: InstantRouteSummary | null;
  /** Smart search only: the counts the run searched from (store `runCounts`) and its limits. A note
   *  for a count it searched is dropped, and one outside the limits says so. */
  run?: { counts: readonly number[]; min: number; max: number } | null;
}

export interface LongerRouteHint {
  kind: 'instant' | 'edge';
  /** The note, in the words the page shows. */
  text: string;
  /** The ascension count to add a chain for. */
  count: number;
  /** The instant answer's route, for "Check exactly" (kind 'instant' only). */
  chain?: number[];
  /** How much sooner the instant answer says it finishes, in seconds (kind 'instant' only). */
  secondsSooner?: number;
}

const ascWord = (n: number) => (n === 1 ? '1 ascension' : `${n} ascensions`);

/** "about 1.5 days sooner", "about 14 hours sooner", or just "sooner" under an hour. */
export function soonerWords(seconds: number): string {
  if (seconds < 3600) return 'sooner';
  if (seconds < 86400) return `about ${Math.round(seconds / 3600)} hours sooner`;
  const d = Math.round((seconds / 86400) * 10) / 10;
  return `about ${d} ${d === 1 ? 'day' : 'days'} sooner`;
}

/** The notes to show, instant answer first. Empty when nothing qualifies. */
export function longerRouteHints(input: LongerRouteInput): LongerRouteHint[] {
  const { bestChain, bestSeconds, searchedCounts, instant } = input;
  if (!bestChain.length || !(bestSeconds > 0)) return [];
  const searched = searchedCounts.filter(n => n >= 1);
  const maxSearched = searched.length ? Math.max(...searched) : 0;
  const out: LongerRouteHint[] = [];

  if (
    instant &&
    instant.chain.length > 0 &&
    instant.chain[instant.chain.length - 1] === bestChain[bestChain.length - 1] &&
    instant.seconds > 0
  ) {
    const gain = bestSeconds - instant.seconds;
    const beyondSearch = maxSearched > 0 && instant.chain.length > maxSearched;
    if (gain > MARGIN_SECONDS || (beyondSearch && gain > 0)) {
      out.push({
        kind: 'instant',
        count: instant.chain.length,
        chain: [...instant.chain],
        secondsSooner: gain,
        text: `The instant answer has a route with ${ascWord(instant.chain.length)} that may finish ${soonerWords(gain)} (${instant.chain.join(' ')}).`,
      });
    }
  }

  if (maxSearched > 0 && bestChain.length === maxSearched && maxSearched < MAX_ASCENSIONS) {
    const next = maxSearched + 1;
    // The instant answer's note already points at this count: one note is enough.
    if (!out.some(h => h.count === next)) {
      out.push({
        kind: 'edge',
        count: next,
        text: `Your best route uses the most ascensions you searched (${maxSearched}). A route with ${next} might be faster.`,
      });
    }
  }
  const run = input.run;
  if (!run) return out;
  // The run settled these counts itself; what is left is outside the limits, or never reached.
  return out
    .filter(h => !(h.count >= run.min && h.count <= run.max && run.counts.includes(h.count)))
    .map(h => {
      if (h.count > run.max) return { ...h, text: `${h.text.replace(/\.$/, '')}; your limit is ${run.max}.` };
      if (h.count < run.min) return { ...h, text: `${h.text.replace(/\.$/, '')}; your minimum is ${run.min}.` };
      return h;
    });
}

/**
 * Smart search's "Start from N ascensions": what the button changes, and only that. The starting
 * chain becomes the instant answer's route with `count` ascensions when it has one (else `fallback`,
 * an even spread), the Limits widen just enough to hold `count`, and "find a starting chain" goes
 * off so the search starts there. The Effort tier is left as the player set it: a 33-minute run from
 * this button was Exact's pairs and one-more-or-fewer probe on a 7-ascension chain (review, 9 Oct),
 * and the default is now Fast, which gives each other count in the limits one quick pass and takes minutes.
 */
export interface StartFromCountPlan {
  /** The new starting chain, ending at the target. */
  chain: number[];
  minPrestiges: number;
  maxPrestiges: number;
}
export function startFromCountPlan(o: {
  count: number;
  finalTE: number;
  /** The instant answer's routes, fastest first (store `instantRoutes`). */
  instantRoutes: readonly (readonly number[])[] | null;
  minPrestiges: number;
  maxPrestiges: number;
  /** An even spread with `count` ascensions, when the instant answer has no such route. */
  fallback: () => number[];
}): StartFromCountPlan | null {
  const route = o.instantRoutes?.find(r => r.length === o.count && r[r.length - 1] === o.finalTE);
  const chain = route ? [...route] : o.fallback();
  if (chain.length !== o.count) return null;
  return {
    chain,
    minPrestiges: Math.min(o.minPrestiges, o.count),
    maxPrestiges: Math.max(o.maxPrestiges, o.count),
  };
}
