/**
 * The note for a build-up plan or finish when awake hours are on (Jordan approved, 8 Nov 2026): the planner holds
 * shifts and prestiges to the awake hours but times a build-up's research buys without them, so a plan can schedule buys
 * at night and the finish is a best case (measured 3 h 44 min optimistic on one 12:22 am save). It goes until the
 * planner holds the buys to the hours too. Plain words: no "simulator", no names. Wording only (a *Words.ts file is out
 * of the result code hash, lib/resultCodeHash.ts `isWordingOnly`). UI imports these where a build-up plan or finish
 * shows with awake hours on: the Build-up tracker, My runs, and the instant answer's first step.
 */

/** The one-line note. */
export const NIGHT_BUY_NOTE =
  'With awake hours on, this plan may buy research at night, outside your hours, so the finish is a best case: it can be hours later.';
/** A shorter form, for a tight place (a tile, the first step line). */
export const NIGHT_BUY_NOTE_SHORT = 'Buys may fall outside your awake hours, so the finish is a best case.';
/** One sentence for the "?" tip. */
export const NIGHT_BUY_TIP =
  'A build-up plan keeps shifts and prestiges inside your awake hours but not its research buys, so it may plan buys at night. Doing them in your own hours makes the finish later: on one save it was 3 h 44 min.';
