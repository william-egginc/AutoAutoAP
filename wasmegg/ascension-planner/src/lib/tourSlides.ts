/**
 * The first-visit tour's slideshow (spec-firsttour2, 9 Nov 2026; design ~/code/aaap-tools/notes/tutorial-v2-design.md):
 * one picture per step, a real screen of a sample account ("Sample": a scrubbed save, no player ID) with everything but
 * the step's part greyed out, baked in. Tour v3 (spec-tour-v3, 16 Nov 2026) adds an arrow to each, and a
 * magnified target when a slide points at one thing. Made by ~/code/aaap-tools/harness-r7/simpler/tour/make-tour-images-v3.mjs
 * (rerun it whenever one of these screens changes; it writes assets/tour/rings.json too, which lib/tourRings.spec.ts checks). Imported, so vite fingerprints them; the page
 * asks for them only when the slideshow shows, and a <picture> fetches one set (desk from 640 px, phone below).
 * Nothing the result hash covers imports this file.
 */
import { stepsFor, type TourStepId } from './firstTour';
import tabManualDesk from '@/assets/tour/1-tab-manual-desk.webp';
import tabManualPhone from '@/assets/tour/1-tab-manual-phone.webp';
import tabAutoDesk from '@/assets/tour/2-tab-auto-desk.webp';
import tabAutoPhone from '@/assets/tour/2-tab-auto-phone.webp';
import tabChainDesk from '@/assets/tour/3-tab-chain-desk.webp';
import tabChainPhone from '@/assets/tour/3-tab-chain-phone.webp';
import tabMyrunsDesk from '@/assets/tour/4-tab-myruns-desk.webp';
import tabMyrunsPhone from '@/assets/tour/4-tab-myruns-phone.webp';
import loadDesk from '@/assets/tour/5-load-desk.webp';
import loadPhone from '@/assets/tour/5-load-phone.webp';
import goalTargetDesk from '@/assets/tour/6-goal-target-desk.webp';
import goalTargetPhone from '@/assets/tour/6-goal-target-phone.webp';
import goalDateDesk from '@/assets/tour/7-goal-date-desk.webp';
import goalDatePhone from '@/assets/tour/7-goal-date-phone.webp';
import dateDesk from '@/assets/tour/8-date-desk.webp';
import datePhone from '@/assets/tour/8-date-phone.webp';
import firstStepDesk from '@/assets/tour/9-first-step-desk.webp';
import firstStepPhone from '@/assets/tour/9-first-step-phone.webp';
import simulateDesk from '@/assets/tour/10-simulate-desk.webp';
import simulatePhone from '@/assets/tour/10-simulate-phone.webp';
import followDesk from '@/assets/tour/11-follow-desk.webp';
import followPhone from '@/assets/tour/11-follow-phone.webp';
import trackerDesk from '@/assets/tour/12-tracker-desk.webp';
import trackerPhone from '@/assets/tour/12-tracker-phone.webp';
import setupWhereDesk from '@/assets/tour/13-setup-where-desk.webp';
import setupWherePhone from '@/assets/tour/13-setup-where-phone.webp';
import setupDesk from '@/assets/tour/14-setup-desk.webp';
import setupPhone from '@/assets/tour/14-setup-phone.webp';
import moreWhereDesk from '@/assets/tour/15-more-where-desk.webp';
import moreWherePhone from '@/assets/tour/15-more-where-phone.webp';

/** The files behind each slide (src/assets/tour/), numbered in tour order (tour v3, spec-tour-v3, 16 Nov 2026). */
export const TOUR_IMAGES: Record<TourStepId, { desk: string; phone: string }> = {
  tabManual: { desk: '1-tab-manual-desk.webp', phone: '1-tab-manual-phone.webp' },
  tabAuto: { desk: '2-tab-auto-desk.webp', phone: '2-tab-auto-phone.webp' },
  tabChain: { desk: '3-tab-chain-desk.webp', phone: '3-tab-chain-phone.webp' },
  tabMyruns: { desk: '4-tab-myruns-desk.webp', phone: '4-tab-myruns-phone.webp' },
  load: { desk: '5-load-desk.webp', phone: '5-load-phone.webp' },
  goalTarget: { desk: '6-goal-target-desk.webp', phone: '6-goal-target-phone.webp' },
  goalDate: { desk: '7-goal-date-desk.webp', phone: '7-goal-date-phone.webp' },
  date: { desk: '8-date-desk.webp', phone: '8-date-phone.webp' },
  firstStep: { desk: '9-first-step-desk.webp', phone: '9-first-step-phone.webp' },
  simulate: { desk: '10-simulate-desk.webp', phone: '10-simulate-phone.webp' },
  follow: { desk: '11-follow-desk.webp', phone: '11-follow-phone.webp' },
  tracker: { desk: '12-tracker-desk.webp', phone: '12-tracker-phone.webp' },
  setupWhere: { desk: '13-setup-where-desk.webp', phone: '13-setup-where-phone.webp' },
  setup: { desk: '14-setup-desk.webp', phone: '14-setup-phone.webp' },
  moreWhere: { desk: '15-more-where-desk.webp', phone: '15-more-where-phone.webp' },
};

export interface TourPicture {
  src: string;
  width: number;
  height: number;
}
export interface TourSlide {
  id: TourStepId;
  /** From 640 px: 720×406 (a 1100 px screen's 1100×620 crop). */
  desk: TourPicture;
  /** Below 640 px: 390×440. */
  phone: TourPicture;
}
const desk = (src: string): TourPicture => ({ src, width: 720, height: 406 });
const phone = (src: string): TourPicture => ({ src, width: 390, height: 440 });

export const TOUR_SLIDES: TourSlide[] = [
  { id: 'tabManual', desk: desk(tabManualDesk), phone: phone(tabManualPhone) },
  { id: 'tabAuto', desk: desk(tabAutoDesk), phone: phone(tabAutoPhone) },
  { id: 'tabChain', desk: desk(tabChainDesk), phone: phone(tabChainPhone) },
  { id: 'tabMyruns', desk: desk(tabMyrunsDesk), phone: phone(tabMyrunsPhone) },
  { id: 'load', desk: desk(loadDesk), phone: phone(loadPhone) },
  { id: 'goalTarget', desk: desk(goalTargetDesk), phone: phone(goalTargetPhone) },
  { id: 'goalDate', desk: desk(goalDateDesk), phone: phone(goalDatePhone) },
  { id: 'date', desk: desk(dateDesk), phone: phone(datePhone) },
  { id: 'firstStep', desk: desk(firstStepDesk), phone: phone(firstStepPhone) },
  { id: 'simulate', desk: desk(simulateDesk), phone: phone(simulatePhone) },
  { id: 'follow', desk: desk(followDesk), phone: phone(followPhone) },
  { id: 'tracker', desk: desk(trackerDesk), phone: phone(trackerPhone) },
  { id: 'setupWhere', desk: desk(setupWhereDesk), phone: phone(setupWherePhone) },
  { id: 'setup', desk: desk(setupDesk), phone: phone(setupPhone) },
  { id: 'moreWhere', desk: desk(moreWhereDesk), phone: phone(moreWherePhone) },
];
/** The slides for what is loaded: a save file with no player ID has no My runs tab and ends at Follow this route (lib/firstTour.ts stepsFor). */
export function slidesFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourSlide[] {
  const ids = stepsFor(p);
  return TOUR_SLIDES.filter(s => ids.includes(s.id));
}
