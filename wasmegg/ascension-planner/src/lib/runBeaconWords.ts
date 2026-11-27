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
  "A search expected to take 2 hours or more tells the planner's server when it starts and when it stops: a random code for that search, its kind, its estimated time, the page version, when it started and why it ended. Nothing about you or your account. If an update is being prepared, the maintainer is told to wait for your search. This is always on while the maintainer is updating the site.";

/** The banner while a long search is being chosen, before it starts (closable; Jordan, 16 Nov 2026: the message goes to the updater, not a report to the maintainer). */
export const LONG_RUN_START_WORDS =
  "This is a long search (2 hours or more). If you start it, the planner will tell the site's updater, so if an update is being prepared, the maintainer waits for your search.";

/**
 * The banner (closable), shown only when the maintainer plans a forced update of the site and only on a page whose long
 * search is still running (not reported stopped). `plannedAt` as "3:00 pm" (12-hour, the player's zone). The update
 * reloads the page and a reload stops a running search (App.vue), so the line says so, then what to do.
 */
export function longRunBannerWords(plannedAt: string): string {
  return `The site will update at about ${plannedAt}, and the update reloads this page, which would stop your search. Please message Williamthe5thc on Discord and the update will wait for it.`;
}
/**
 * The planned-update notice on every page (R8.1, 18 Nov 2026), for a page with no long search running (components/PlannedUpdateNotice.vue).
 * `plannedAt` as in longRunBannerWords. The owner's note, if any, follows on its own line.
 */
// DRAFT: Words and Jordan review before use (18 Nov 2026).
export function plannedUpdateWords(plannedAt: string): string {
  return `The site will update at about ${plannedAt}. The update reloads this page, so finish or save what you are doing before then.`;
}
/** The banner's close button, for screen readers and its visible text. */
export const LONG_RUN_BANNER_CLOSE = 'Close';

/**
 * The line shown while setting up a search expected to take 2 hours or more (spec-longstart, Jordan, 16 Nov 2026), before
 * Run, future tense. Words' text (16 Nov 2026, notes/words-tour-v3-and-c3-2026-11-16.md). The meaning, in Jordan's words:
 * "we send a message to the updater, so if an update is being prepped for launch it'll tell the maintainer to wait".
 * `_estimateSeconds`: the screen's estimate (not in the text: the line only shows from 2 hours).
 */
export function longRunStartWords(_estimateSeconds?: number): string {
  return "This is a long search (2 hours or more). If you start it, the planner will tell the site's updater, so if an update is being prepared, the maintainer waits for your search.";
}
