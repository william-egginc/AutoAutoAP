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
  "When a search is expected to take 2 hours or more, the planner's server is told it started and ended: a random code for that search, its kind, its estimated time, the page version, when it started and why it ended. Nothing about you or your account. It lets the maintainer wait before updating the site, so your search isn't lost to a reload.";
/** The line under the tick when it is off. */
export const BEACON_SETUP_OFF = 'Off: long searches are not reported.';

/**
 * The banner (closable), shown only when the maintainer plans a forced update of the site and only on a page whose long
 * search is still running (not reported stopped). `plannedAt` as "3:00 pm" (12-hour, the player's zone). The update
 * reloads the page and a reload stops a running search (App.vue), so the line says so, then what to do.
 */
export function longRunBannerWords(plannedAt: string): string {
  return `The site will update at about ${plannedAt}, and the update reloads this page, which would stop your search. Please message Williamthe5thc on Discord and the update will wait for it.`;
}
/** The banner's close button, for screen readers and its visible text. */
export const LONG_RUN_BANNER_CLOSE = 'Close';
