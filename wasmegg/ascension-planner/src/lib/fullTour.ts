/**
 * THE FULL TOUR (spec-fulltour, 14 Nov 2026; Jordan: an optional, longer "where everything is" tour, hidden unless asked).
 * The first-visit tour's slideshow engine (composables/useFirstTour.ts, components/TourModal.vue, TourDialog.vue), a second
 * list of steps. It never starts by itself and never nags: it opens only from "Full tour" in More, from the first tour's last
 * card, or from About, and it never reads or writes `aap.tour` (lib/firstTour.ts). Skip and Done just close it.
 * Words: lib/fullTourWords.ts. Pictures: lib/fullTourSlides.ts (loaded only when it opens). Nothing the result hash covers
 * imports this file.
 */

/** The steps, in the order of the page: the top, the Chain Finder card, My runs (its tracker and Your eggs are in that card),
 *  the floating parts, then the rest. Words' twelve cards, 14 Nov 2026. */
export const FULL_TOUR_STEPS = [
  'tabs',
  'chip',
  'saveBlock',
  'switch',
  'filters',
  'answer',
  'followSim',
  'rightNow',
  'dock',
  'more',
  'blackBox',
  'leaderboard',
] as const;
export type FullTourStepId = (typeof FULL_TOUR_STEPS)[number];

/** The steps for what is loaded: with no account there is no chip, My runs or Setup button to show, so the tour is the
 *  answer screen's part only. */
export function fullStepsFor(p: { hasAccount: boolean }): FullTourStepId[] {
  return p.hasAccount ? [...FULL_TOUR_STEPS] : FULL_TOUR_STEPS.filter(s => s === 'tabs' || s === 'switch' || s === 'answer' || s === 'more');
}
