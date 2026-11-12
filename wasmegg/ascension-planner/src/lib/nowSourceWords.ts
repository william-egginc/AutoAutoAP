/**
 * RIGHT NOW'S TAG LINE, words only (spec-uxpass item 1, 8 Nov 2026; DRAFT for Words). Jordan's real-Chrome pass: the
 * instant answer's data was explained four times on one card (the tag line under Following, the follow line, a line
 * under Next step and a footer under the events). It is said once now, on the tag line after the "from the instant
 * answer" pill (components/myruns/RightNowCard.vue `pillSub`), with the one caveat that changes what the player does:
 * times are rounded to the hour, and exact times come from a run in Try next.
 *
 * A *Words.ts file: never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 */

/**
 * The same three, for the "i" box beside the "from the instant answer" pill (12 Nov 2026, Jordan's review: UI moves the
 * explainer behind it). Each starts with a capital and stands alone, no pill before it.
 */
export const SOURCE_INSTANT_INFO_WORDS = 'Worked out ahead of time. Times are rounded to the hour. For exact times, use a run from Try next below.';
export const SOURCE_ESTIMATE_INFO_WORDS = 'Your route is estimated on the instant answer\'s data. Times are rounded to the hour. For exact times, use a run from Try next below.';
export const SOURCE_ESTIMATE_SIM_INFO_WORDS =
  'The ascension you are in is simulated on your save, and the rest is estimated on the instant answer\'s data. Times are rounded to the hour. For exact times, use a run from Try next below.';
