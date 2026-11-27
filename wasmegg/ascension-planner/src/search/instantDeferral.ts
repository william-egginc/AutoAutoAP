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
 * The run just finished: should the panel work its answer out now? Only if it was waiting (the
 * caller's watch dies with the panel). An answer still on screen while it waited is the previous one
 * (`whileWaiting`), so it is worked out again all the same.
 */
export function resumeAfterRun(o: { wasBusy: boolean; busy: boolean; waiting: boolean }): boolean {
  return o.wasBusy && !o.busy && o.waiting;
}

/**
 * The panel waits for a search (`wait`): what it shows meanwhile. The answer already on screen stays,
 * marked as the previous one, until the new one is ready (the user, 10 Oct: pressing Work it out
 * again or Check all again during a By a date search emptied the panel, best card, rows and share
 * box, for a line saying it waits). Only a panel with no answer yet is left empty.
 */
export function whileWaiting(hasAnswer: boolean): { keepAnswer: boolean; text: string } {
  return hasAnswer
    ? {
        keepAnswer: true,
        text: 'A search is running, so the new instant answer waits to save memory. The answer below is the previous one until then.',
      }
    : { keepAnswer: false, text: 'A search is running, so the instant answer waits to save memory.' };
}

/**
 * What the panel's answer depends on, as one string, so it is worked out again only when one of them
 * really changes. Its watch used to return a new array, which Vue always counts as a change, so any
 * time the getter ran again (one of its sources replaced, even by an equal value) the panel ran
 * again; during a search that went to its wait path, which used to drop the answer on screen.
 */
export function answerInputsKey(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
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
 * InstantRunWarning.vue): Work it out again (the "Saved from…" note) or Work it out anyway (the amber
 * "waits" line). Check exactly's two spots went with it (23 Oct 2026).
 */
export type WarnAt = 'again' | 'anyway';

/** The warning open, if any: what it asks about and where it was asked from. */
export interface WarnAsk {
  /** Work it out again forces a fresh answer; the "waits" line's button does not. */
  force: boolean;
  at: WarnAt;
}

/** Show the warning at this spot: only the one whose button was pressed. */
export function warnHere(ask: WarnAsk | null, at: WarnAt): boolean {
  return !!ask && ask.at === at;
}

/**
 * The instant answer's card never shows nothing (Jordan's Safari reload, 23 Oct 2026: the answer gone, no word why):
 * with no answer, nothing loading, no error and nothing waited for, this line says where it stands. Due (a run starts
 * in a moment, or Your setup is still being read): loading. No save yet: it waits for one. Otherwise it has not been
 * worked out, with a button that works it out.
 */
export interface IdleLine {
  text: string;
  spin: boolean;
  /** Show "Work it out". */
  button: boolean;
}
export const IDLE_LOADING = 'Loading the instant answer…';
export const IDLE_NO_SAVE = 'The instant answer is worked out once your save has loaded.';
export const IDLE_NOT_YET = 'The instant answer isn’t worked out yet.';
export function idleLine(o: { due: boolean; setupLoaded: boolean; te: number }): IdleLine {
  if (o.due || !o.setupLoaded) return { text: IDLE_LOADING, spin: true, button: false };
  if (!(o.te > 0)) return { text: IDLE_NO_SAVE, spin: false, button: false };
  return { text: IDLE_NOT_YET, spin: false, button: true };
}
