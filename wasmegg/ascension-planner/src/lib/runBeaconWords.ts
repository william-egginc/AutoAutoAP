/**
 * The long-run alert's words (Jordan approved the About text on 7 Nov 2026; Option 1: on for everyone; the off
 * switch in Setup went on 16 Nov 2026). Wording only (a *Words.ts file is out of the result code hash, lib/resultCodeHash.ts
 * `isWordingOnly`). The facts: notes/long-run-alert-design-2026-11-07.md; the same words are in about.html #long-searches.
 * UI imports these for Setup's switch and for the banner shown to the person who starts a long search.
 */

/** Searches expected to take longer than this (hours) are reported; the client's own constant is BEACON_MIN_SECONDS. */
export const BEACON_MIN_HOURS = 2;

/** Setup's plain line (no tick: there is no switch; Jordan, 16 Nov 2026). Words' text, consent text: Jordan's OK before merge. */
export const BEACON_SETUP_LINE =
  "A search expected to take 2 hours or more tells the planner's server when it starts and when it stops: a random code for that search, its kind, its estimated time, the page version, when it started and why it ended. Nothing about you or your account. This is always on while the maintainer is updating the site, so an update doesn't lose your search.";

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
