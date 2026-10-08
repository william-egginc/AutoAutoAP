/**
 * The instant answer while a search runs (a player's request, Halceyx): its route workers each hold a
 * decoded table, and a chain search needs that memory. So while a Smart search, Full sweep or By a
 * date run is going, a panel that opens (or whose key changes) does not work routes out: it shows a
 * saved answer if there is one, else says it waits, with a button to go ahead anyway.
 */
export type OnArrival = 'compute' | 'restore' | 'wait';

/**
 * What to do when the panel needs an answer: `restore` a saved one (always fine: no work), `wait`
 * while a run is going (unless the player said go ahead), else `compute`.
 */
export function onArrival(o: { runBusy: boolean; hasSaved: boolean; goAhead: boolean }): OnArrival {
  if (o.hasSaved) return 'restore';
  if (o.runBusy && !o.goAhead) return 'wait';
  return 'compute';
}

/**
 * The run just finished: should the panel work its answer out now? Only if it was waiting, is still
 * open (the caller's watch dies with it) and still has no answer.
 */
export function resumeAfterRun(o: { wasBusy: boolean; busy: boolean; waiting: boolean; hasAnswer: boolean }): boolean {
  return o.wasBusy && !o.busy && o.waiting && !o.hasAnswer;
}
