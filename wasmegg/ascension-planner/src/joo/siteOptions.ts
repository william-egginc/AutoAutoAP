/**
 * The Joo site (Joo-lite, Oct 2026): a slim, read-only copy of the planner built from this same code
 * with `VITE_SITE=joo` (`pnpm build:joo` -> dist-joo; main-joo.ts + AppJoo.vue). Without the flag
 * nothing here changes the full site: `isJooSite()` is false and every gate reads as before.
 *
 * The open choices for that site (questions to Jordan, 18 Oct 2026) each sit in ONE constant below, so
 * a different answer is a one-line change.
 */

/** True in the Joo site's build (and its dev server, `pnpm dev:joo`). A function, not a constant, so
 *  specs can switch it with `vi.stubEnv('VITE_SITE', 'joo')`; vite inlines it in a build. */
export function isJooSite(): boolean {
  // `?.`: also read outside vite (the collector's specs import some of the gated modules).
  return import.meta.env?.VITE_SITE === 'joo';
}

/** The Joo site's tabs (AppJoo.vue). */
export type JooTab = 'manual' | 'auto' | 'myruns';

export const JOO_OPTIONS = {
  /** The tab a plain visit opens on (Joo's own site opens on Manual). */
  defaultTab: 'myruns' as JooTab,
  /** The tabs sit inside the header card, as on Joo's site (false: always visible below it, as on ours). */
  tabsInHeader: true,
  /** The Auto Planner tab is our Single run file (components/auto/AutomaticPlanner.vue: Your setup's hours,
   *  build-up, "Simulate this plan" lands there). False would mean upstream's verbatim, not built yet. */
  autoPlannerIsSingleRun: true,
  /** Light (the stronger check under the instant answer, with Refine: a search of up to 10 min). */
  showLight: false,
  /** A short About page of the Joo site's own (false: the full site's about.html). */
  aboutShort: true,
  /** The "New on the planner" banner (release.ts notes are the full site's). The reload line stays. */
  showNewBanner: false,
  /** A link to the full planner from the read-only line; hidden while FULL_PLANNER_URL is empty. */
  linkToFullPlanner: true,
} as const;

/** The full planner's address, for the read-only line's link. Empty: no link. */
export const FULL_PLANNER_URL = '';

/** Whether the read-only line links to the full planner. */
export function showFullPlannerLink(url: string = FULL_PLANNER_URL): boolean {
  return JOO_OPTIONS.linkToFullPlanner && url.trim() !== '';
}

/** Why a write was refused on the Joo site (readOnlyFetch.ts and the gates say this). */
export const JOO_READ_ONLY = 'This site only reads: runs are sent from the full planner.';
