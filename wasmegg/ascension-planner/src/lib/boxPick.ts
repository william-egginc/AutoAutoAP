/**
 * WHICH PICK THE GREEN BOX SHOWS while Check exactly runs (Jordan, 22 Oct 2026: By a date's headline went 313 TE,
 * then 309 TE · exact, then 310 TE · exact as the counts finished one by one, while the Prestige by line still said
 * 313; players read that as the answer changing).
 *
 * The box keeps the instant answer's pick until every count Check exactly started has its final result, saying
 * how far the check is; then it switches to the exact pick. The counts table may fill in meanwhile. A check that
 * was stopped or failed must not leave the box on "checking…": it shows the exact picks so far, or the instant
 * answer's when no count finished. With no Check exactly started (the page just loaded, a saved check put back),
 * nothing changes: the box shows whatever is there.
 */
export type ExactRunStatus = 'idle' | 'running' | 'done' | 'error' | 'waiting';

export interface BoxPickInput {
  /** Check exactly's status (InstantRoute.vue `exactStatus`). */
  status: ExactRunStatus;
  /** A Check exactly started on this answer and has not finished ('done') since. */
  begun: boolean;
  /** The counts (numbers of ascensions) the check prices, and how many have their final result. */
  counts: number;
  finished: number;
}

export interface BoxPick {
  /** 'instant': the box shows the instant answer's pick; 'exact': Check exactly's, as before. */
  shows: 'instant' | 'exact';
  /** The words beside the headline in place of "exact, your account" ('' for none: the box's own wording). */
  marker: string;
}

/** "(2 of 5 counts done)". */
export function countsDone(finished: number, counts: number): string {
  const m = Math.max(counts, finished);
  return `(${finished} of ${m} ${m === 1 ? 'count' : 'counts'} done)`;
}

export function boxPick(i: BoxPickInput): BoxPick {
  if (!i.begun || i.status === 'done') return { shows: 'exact', marker: '' };
  if (i.status === 'running')
    return {
      shows: 'instant',
      marker: `instant answer, checking on your account… ${countsDone(i.finished, i.counts)}`,
    };
  // Paused for a search the player started: it starts again from the beginning when the search ends.
  if (i.status === 'waiting')
    return { shows: 'instant', marker: 'instant answer, checked on your account when your search ends' };
  // Stopped or failed: the exact picks so far, in the box's own wording; the instant answer's when none finished.
  return i.finished > 0 ? { shows: 'exact', marker: '' } : { shows: 'instant', marker: 'instant answer' };
}

/**
 * The plain line under the marker while Check exactly runs (Jordan, 22 Oct 2026): why the box waits. With hours set
 * the simulator holds the shifts and prestiges for them, which the instant answer can't see (with any hour, exact
 * and instant agree, so the box would not change). Fastest has no date to miss, so no line about lowering.
 */
export function checkingWhy(goal: 'date' | 'fastest', hoursSet: boolean): string {
  if (!hoursSet) return 'Pricing each route with the full simulator on your save…';
  return goal === 'date'
    ? 'Your playing hours move egg shifts and prestiges, so each route is being priced on your hours. Routes that miss the date are lowered or swapped for a nearby one. The answer above updates once, when every count is done.'
    : 'Your playing hours move egg shifts and prestiges, so each route is being priced on your hours. The answer above updates once, when every count is done.';
}
