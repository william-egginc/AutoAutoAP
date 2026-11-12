/**
 * The note for a build-up plan or finish whose research buys are NOT held to the awake hours (Jordan approved, 8 Nov 2026).
 * It was written when the planner held shifts and prestiges to the hours but timed a build-up's buys without them (a
 * best case, measured 3 h 44 min optimistic on one 12:22 am save). The simulated ascension holds its buys to the hours too
 * now (search/leg.ts `holdUntil`, auto/shifts/helpers/advanceTime.ts `stretchToHours`, spec-awakebuys), so My runs, the
 * tracker and the Auto Planner's result cards say it only for a run with "hold my shifts" off (lib/nightBuyNote.ts
 * `nightBuyHours`); the instant answer keeps it, its first ascension coming from the table, which holds nothing. Plain
 * words: no "simulator", no names. Wording only (a *Words.ts file is out of the result code hash, lib/resultCodeHash.ts
 * `isWordingOnly`). Words' wording of 12 Nov 2026.
 */

/** The one-line note (My runs, the Build-up tracker): the run's egg shifts do not wait for the hours, so its buys do not either. */
export const NIGHT_BUY_NOTE =
  "This plan's egg shifts don't wait for your awake hours, so it may buy research at night and the finish is a best case: it can be hours later.";
/** A shorter form, for a tight place (an Auto Planner result card). */
export const NIGHT_BUY_NOTE_SHORT = "Shifts don't wait for your hours, so buys may fall at night and the finish is a best case.";
/** One sentence for the "?" tip, with the two notes above. */
export const NIGHT_BUY_TIP =
  "This run's egg shifts don't wait for your awake hours, and neither do its research buys, so it may plan buys at night. Making them wait makes the finish later: on one save it was 3 h 44 min.";
/** The instant answer's note (Jordan, 12 Nov 2026): a quick estimate that may buy at night; My runs after Follow has the exact times. */
export const INSTANT_NIGHT_BUY_NOTE = "Quick estimate: it may buy research at night. After you press Follow, My runs shows exact times.";
/** The instant answer's "?" tip. */
export const INSTANT_NIGHT_BUY_TIP =
  "The instant answer is a quick estimate and does not hold its research buys to your awake hours, so it may buy at night. After you press Follow, My runs works out the exact times with the buys inside your hours. The finish there can be later: on one save it was 3 h 44 min.";
