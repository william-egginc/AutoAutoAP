/**
 * The long-run alert's words (Jordan approved the About text on 7 Nov 2026; Option 1: on for everyone, with an off
 * switch in Setup). Wording only (a *Words.ts file is out of the result code hash, lib/resultCodeHash.ts
 * `isWordingOnly`). The facts: notes/long-run-alert-design-2026-11-07.md; the same words are in about.html #long-searches.
 * UI imports these for Setup's switch and for the banner shown to the person who starts a long search.
 */

/** Searches expected to take longer than this (hours) are reported; the client's own constant is BEACON_MIN_SECONDS. */
export const BEACON_MIN_HOURS = 2;

/** Setup's tick (on to start). */
export const BEACON_SETUP_LABEL = 'Tell the maintainer about long searches';
export const BEACON_SETUP_LINE =
  "When a search is expected to take over 2 hours, the planner's server is told it started and ended: a random code for that search, its kind, its estimated time and the page version. Nothing about you or your account. It lets the maintainer wait before updating the site, so your search isn't lost to a reload.";
/** The line under the tick when it is off. */
export const BEACON_SETUP_OFF = 'Off: long searches are not reported.';

/** The banner shown to the person who starts a long search (closable). `estimate` as "3 h 30 min", `until` as "7:34 pm". */
export function longRunBannerWords(estimate: string, until: string): string {
  return `This search should take about ${estimate} (until about ${until}). Please message Williamthe5thc on Discord so site updates wait for it.`;
}
/** The banner's close button, for screen readers and its visible text. */
export const LONG_RUN_BANNER_CLOSE = 'Close';
