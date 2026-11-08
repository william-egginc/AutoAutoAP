/**
 * RIGHT NOW'S TAG LINE, words only (spec-uxpass item 1, 8 Nov 2026; DRAFT for Words). Jordan's real-Chrome pass: the
 * instant answer's data was explained four times on one card (the tag line under Following, the follow line, a line
 * under Next step and a footer under the events). It is said once now, on the tag line after the "from the instant
 * answer" pill (components/myruns/RightNowCard.vue `pillSub`), with the one caveat that changes what the player does:
 * times are rounded to the hour, and exact times come from a run in Try next.
 *
 * A *Words.ts file: never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */

/** The instant answer's own plan: "from the instant answer" + this. */
export const SOURCE_INSTANT_WORDS = 'worked out ahead of time, times rounded to the hour. For exact times, use a run from Try next below.';

/** A followed route priced on the instant answer's data (lib/followEstimate.ts). */
export const SOURCE_ESTIMATE_WORDS = 'your route estimated on its data, times rounded to the hour. For exact times, use a run from Try next below.';

/** The same, with the ascension you are in simulated on the save (lib/followSim.ts `withCurrentSim`). */
export const SOURCE_ESTIMATE_SIM_WORDS =
  'the ascension you are in simulated on your save, the rest estimated on its data, times rounded to the hour. For exact times, use a run from Try next below.';
