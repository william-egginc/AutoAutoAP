/**
 * THE FULL TOUR (spec-fulltour, 14 Nov 2026; Jordan: an optional, longer "where everything is" tour, hidden unless asked).
 * The first-visit tour's slideshow engine (composables/useFirstTour.ts, components/TourModal.vue, TourDialog.vue), a second
 * list of steps. It never starts by itself and never nags: it opens only from "Full tour" in More, from the first tour's last
 * card, or from About, and it never reads or writes `aap.tour` (lib/firstTour.ts). Skip and Done just close it.
 * Words: lib/fullTourWords.ts. Pictures: lib/fullTourSlides.ts (loaded only when it opens). Nothing the result hash covers
 * imports this file.
 */

/** The steps, as rebuilt in the v3 style (spec-tour-v4, 16 Nov 2026, Jordan: "rebuild the full tour as v3's slides plus everything inside
 *  More"): forty-two, one thing a slide. Part 1 is the quick tour's slides (lib/firstTour.ts; its gear slide is here as `m10maxedGear`,
 *  its closing card is dropped) with the three optional tabs added after My runs. Part 2 is what More holds on Chain Finder, part 3
 *  what More holds on My runs. Slides that are in the quick tour share its pictures. */
export const FULL_TOUR_STEPS = [
  'tabManual',
  'tabAuto',
  'tabChain',
  'tabMyruns',
  'tabLeaderboard',
  'tabScience',
  'tabInsights',
  'load',
  'goalTarget',
  'goalDate',
  'result',
  'filters',
  'setupAwake',
  'setupTimeOff',
  'prefer',
  'simulate',
  'follow',
  'myrunsPage',
  'followedRoute',
  'nextStep',
  'tracker',
  'setupWhere',
  'setupInside',
  'shifts',
  'm1more',
  'm2search',
  'm3fast',
  'm4exact',
  'm5custom',
  'm6run',
  'm7send',
  'm8whatThisDoes',
  'm9searchSettings',
  'm10maxedGear',
  'm11steppingAway',
  'm12howItWorks',
  'r1changeRoute',
  'r2gearSets',
  'r3tryNext',
  'r4share',
  'r5yourRuns',
  'r6boardRuns',
] as const;
export type FullTourStepId = (typeof FULL_TOUR_STEPS)[number];

/** The steps for what is loaded: with no account there is no My runs, Setup button or More to show, so the tour is the tabs and the
 *  answer screen's top (the tabs, the goal switch, the filters button). */
export function fullStepsFor(p: { hasAccount: boolean }): FullTourStepId[] {
  const noAccount = new Set<FullTourStepId>(['tabManual', 'tabAuto', 'tabChain', 'load', 'goalTarget', 'goalDate']);
  return p.hasAccount ? [...FULL_TOUR_STEPS] : FULL_TOUR_STEPS.filter(s => noAccount.has(s));
}
