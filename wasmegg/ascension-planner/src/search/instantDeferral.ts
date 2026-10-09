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

/**
 * The instant answer's own background work: the exact check (the full simulator on chain workers),
 * the nearest gear tables (two route workers of their own) and the background polish.
 */
export interface InstantWork {
  exact: boolean;
  bracket: boolean;
  polish: boolean;
}

/**
 * While a search runs, that work waits, unless the player chose to run the instant answer alongside
 * it: Your setup's "Let the instant answer run during a search", or the memory warning's Run it anyway
 * (`alongside`). Waiting is always allowed; this only says when starting is.
 */
export function backgroundMayStart(o: { runBusy: boolean; alongside: boolean }): boolean {
  return !o.runBusy || o.alongside;
}

/**
 * A search just started (review, 9 Oct: "the instant workers are still going when a run is going",
 * an exact check begun before Find kept checking through the run): which of the work in flight to
 * pause until it ends. All of it, unless the player chose to run alongside. The route finding itself
 * (seconds, and what the panel shows) is not in here and is never cut off.
 */
export function pauseForRun(o: {
  wasBusy: boolean;
  busy: boolean;
  alongside: boolean;
  running: InstantWork;
}): InstantWork {
  const go = o.busy && !o.wasBusy && !o.alongside;
  return { exact: go && o.running.exact, bracket: go && o.running.bracket, polish: go && o.running.polish };
}

/**
 * Which button asked for the memory warning, so it shows directly under that button (InstantRoute.vue,
 * InstantRunWarning.vue): Work it out again (the "Saved from…" note), Work it out anyway (the amber
 * "waits" line), or Check exactly / Check all again in the By a date or the fastest-route card.
 */
export type WarnAt = 'again' | 'anyway' | 'check-date' | 'check-fastest';

/** The warning open, if any: what it asks about and where it was asked from. */
export interface WarnAsk {
  /** Work it out again forces a fresh answer; the "waits" line's button does not. */
  force: boolean;
  /** Check exactly / Check all again (else working the answer out). */
  check?: boolean;
  at: WarnAt;
}

/** Show the warning at this spot: only the one whose button was pressed. */
export function warnHere(ask: WarnAsk | null, at: WarnAt): boolean {
  return !!ask && ask.at === at;
}
