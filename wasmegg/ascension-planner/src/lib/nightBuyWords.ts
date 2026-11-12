/**
 * The note for a build-up plan or finish whose research buys are NOT held to the awake hours (Jordan approved, 8 Nov 2026).
 * It was written when the planner held shifts and prestiges to the hours but timed a build-up's buys without them (a
 * best case, measured 3 h 44 min optimistic on one 12:22 am save). The simulated ascension holds its buys to the hours too
 * now (search/leg.ts `holdUntil`, auto/shifts/helpers/advanceTime.ts `stretchToHours`, spec-awakebuys), so My runs, the
 * tracker and the Auto Planner's result cards say it only for a run with "hold my shifts" off (lib/nightBuyNote.ts
 * `nightBuyHours`); the instant answer keeps it, its first ascension coming from the table, which holds nothing. Plain
 * words: no "simulator", no names. Wording only (a *Words.ts file is out of the result code hash, lib/resultCodeHash.ts
 * `isWordingOnly`). Words' wording of the strings below is still to do after this change.
 */

/** The one-line note. */
export const NIGHT_BUY_NOTE =
  'With awake hours on, this plan may buy research at night, outside your hours, so the finish is a best case: it can be hours later.';
/** A shorter form, for a tight place (a tile, the first step line). */
export const NIGHT_BUY_NOTE_SHORT = 'Buys may fall outside your awake hours, so the finish is a best case.';
/** One sentence for the "?" tip. */
export const NIGHT_BUY_TIP =
  'A build-up plan keeps shifts and prestiges inside your awake hours but not its research buys, so it may plan buys at night. Doing them in your own hours makes the finish later: on one save it was 3 h 44 min.';
