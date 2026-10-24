/**
 * Which Auto Planner screen a running search belongs to, for the progress bar (RunProgressBar.vue),
 * its Jump to it / Show it, and the "is running" line that greys the other screens out.
 *
 * A chain search or a date search belongs to the screen of its kind, wherever it was started: a
 * carry-on that starts by itself (the countdown, a reload) used to take the screen shown at that moment,
 * so a Full sweep carried on while By a date was open counted as By a date's run. The bar then said
 * "Jump to it" on By a date, and By a date wasn't greyed out (the user, egg-beta review 11 Oct). Only a
 * start-time sweep, which runs from either Fastest depth, keeps the screen it was started from.
 */
export type SearchScreen = 'smart' | 'full' | 'by-date';
export type RunKind = SearchScreen | 'start-times';

export function runScreenOf(
  kind: RunKind | null | undefined,
  startedOn: SearchScreen | null,
  fastestDepth: 'smart' | 'full'
): SearchScreen | null {
  if (!kind) return null;
  if (kind !== 'start-times') return kind;
  return startedOn ?? fastestDepth;
}
