/**
 * The full tour's pictures (spec-fulltour, 14 Nov 2026; rebuilt in the v3 style, spec-tour-v4, 16 Nov 2026): the same kind as the
 * first tour's (lib/tourSlides.ts): a clean page picture shared by neighbouring slides, with a live overlay (ring, arrow,
 * enlarged copy, tab ring) that slides from one target to the next. The slides the two tours share use the very same pictures;
 * the rest (the optional tabs, what is inside More on Chain Finder and on My Runs) are made by the same generator
 * (~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v4.mjs). Loaded ONLY when the full tour opens
 * (components/TourModal.vue imports this file dynamically). Nothing the result hash covers imports this file.
 */
import { FULL_TOUR_STEPS, type FullTourStepId } from './fullTour';
import { buildSlide, TOUR_FILES, type SlideOverlay, type TourPicture } from './tourSlides';

export interface FullTourSlide {
  id: FullTourStepId;
  desk: TourPicture;
  phone: TourPicture;
  overlay?: { desk: SlideOverlay; phone: SlideOverlay };
}
/** A shared slide's baked fallback is the first tour's file; the full tour's own slides are all live (a single target each). */
const baked = (id: FullTourStepId): string => (TOUR_FILES as Record<string, string>)[id] ?? id;
/** The tab slides are shot with the optional tabs turned on (their real on/off state), so they have their own pictures, keyed `full-<id>`. */
const OWN_TAB_PICTURES: readonly FullTourStepId[] = ['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'tabLeaderboard', 'tabScience', 'tabInsights'];
export const FULL_TOUR_SLIDES: FullTourSlide[] = FULL_TOUR_STEPS.map(id => buildSlide(id, baked(id), OWN_TAB_PICTURES.includes(id) ? `full-${id}` : id));
