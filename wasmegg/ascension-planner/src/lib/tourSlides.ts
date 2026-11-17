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
import resultDesk from '@/assets/tour/8-result-desk.webp';
import resultPhone from '@/assets/tour/8-result-phone.webp';
import filtersDesk from '@/assets/tour/9-filters-desk.webp';
import filtersPhone from '@/assets/tour/9-filters-phone.webp';
import setupAwakeDesk from '@/assets/tour/10-setup-awake-desk.webp';
import setupAwakePhone from '@/assets/tour/10-setup-awake-phone.webp';
import setupTimeOffDesk from '@/assets/tour/11-setup-time-off-desk.webp';
import setupTimeOffPhone from '@/assets/tour/11-setup-time-off-phone.webp';
import preferDesk from '@/assets/tour/12-prefer-desk.webp';
import preferPhone from '@/assets/tour/12-prefer-phone.webp';
import gearDesk from '@/assets/tour/13-gear-desk.webp';
import gearPhone from '@/assets/tour/13-gear-phone.webp';
import simulateDesk from '@/assets/tour/14-simulate-desk.webp';
import simulatePhone from '@/assets/tour/14-simulate-phone.webp';
import followDesk from '@/assets/tour/15-follow-desk.webp';
import followPhone from '@/assets/tour/15-follow-phone.webp';
import myrunsPageDesk from '@/assets/tour/16-myruns-page-desk.webp';
import myrunsPagePhone from '@/assets/tour/16-myruns-page-phone.webp';
import followedRouteDesk from '@/assets/tour/17-followed-route-desk.webp';
import followedRoutePhone from '@/assets/tour/17-followed-route-phone.webp';
import nextStepDesk from '@/assets/tour/18-next-step-desk.webp';
import nextStepPhone from '@/assets/tour/18-next-step-phone.webp';
import trackerDesk from '@/assets/tour/19-tracker-desk.webp';
import trackerPhone from '@/assets/tour/19-tracker-phone.webp';
import setupWhereDesk from '@/assets/tour/20-setup-where-desk.webp';
import setupWherePhone from '@/assets/tour/20-setup-where-phone.webp';
import setupInsideDesk from '@/assets/tour/21-setup-inside-desk.webp';
import setupInsidePhone from '@/assets/tour/21-setup-inside-phone.webp';
import shiftsDesk from '@/assets/tour/22-shifts-desk.webp';
import shiftsPhone from '@/assets/tour/22-shifts-phone.webp';
import closingDesk from '@/assets/tour/23-closing-desk.webp';
import closingPhone from '@/assets/tour/23-closing-phone.webp';

/** The files behind each slide (src/assets/tour/), numbered in tour order (tour v3, spec-tour-v3, 16 Nov 2026). */
export const TOUR_IMAGES: Record<TourStepId, { desk: string; phone: string }> = {
  tabManual: { desk: '1-tab-manual-desk.webp', phone: '1-tab-manual-phone.webp' },
  tabAuto: { desk: '2-tab-auto-desk.webp', phone: '2-tab-auto-phone.webp' },
  tabChain: { desk: '3-tab-chain-desk.webp', phone: '3-tab-chain-phone.webp' },
  tabMyruns: { desk: '4-tab-myruns-desk.webp', phone: '4-tab-myruns-phone.webp' },
  load: { desk: '5-load-desk.webp', phone: '5-load-phone.webp' },
  goalTarget: { desk: '6-goal-target-desk.webp', phone: '6-goal-target-phone.webp' },
  goalDate: { desk: '7-goal-date-desk.webp', phone: '7-goal-date-phone.webp' },
  result: { desk: '8-result-desk.webp', phone: '8-result-phone.webp' },
  filters: { desk: '9-filters-desk.webp', phone: '9-filters-phone.webp' },
  setupAwake: { desk: '10-setup-awake-desk.webp', phone: '10-setup-awake-phone.webp' },
  setupTimeOff: { desk: '11-setup-time-off-desk.webp', phone: '11-setup-time-off-phone.webp' },
  prefer: { desk: '12-prefer-desk.webp', phone: '12-prefer-phone.webp' },
  gear: { desk: '13-gear-desk.webp', phone: '13-gear-phone.webp' },
  simulate: { desk: '14-simulate-desk.webp', phone: '14-simulate-phone.webp' },
  follow: { desk: '15-follow-desk.webp', phone: '15-follow-phone.webp' },
  myrunsPage: { desk: '16-myruns-page-desk.webp', phone: '16-myruns-page-phone.webp' },
  followedRoute: { desk: '17-followed-route-desk.webp', phone: '17-followed-route-phone.webp' },
  nextStep: { desk: '18-next-step-desk.webp', phone: '18-next-step-phone.webp' },
  tracker: { desk: '19-tracker-desk.webp', phone: '19-tracker-phone.webp' },
  setupWhere: { desk: '20-setup-where-desk.webp', phone: '20-setup-where-phone.webp' },
  setupInside: { desk: '21-setup-inside-desk.webp', phone: '21-setup-inside-phone.webp' },
  shifts: { desk: '22-shifts-desk.webp', phone: '22-shifts-phone.webp' },
  closing: { desk: '23-closing-desk.webp', phone: '23-closing-phone.webp' },
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
  { id: 'result', desk: desk(resultDesk), phone: phone(resultPhone) },
  { id: 'filters', desk: desk(filtersDesk), phone: phone(filtersPhone) },
  { id: 'setupAwake', desk: desk(setupAwakeDesk), phone: phone(setupAwakePhone) },
  { id: 'setupTimeOff', desk: desk(setupTimeOffDesk), phone: phone(setupTimeOffPhone) },
  { id: 'prefer', desk: desk(preferDesk), phone: phone(preferPhone) },
  { id: 'gear', desk: desk(gearDesk), phone: phone(gearPhone) },
  { id: 'simulate', desk: desk(simulateDesk), phone: phone(simulatePhone) },
  { id: 'follow', desk: desk(followDesk), phone: phone(followPhone) },
  { id: 'myrunsPage', desk: desk(myrunsPageDesk), phone: phone(myrunsPagePhone) },
  { id: 'followedRoute', desk: desk(followedRouteDesk), phone: phone(followedRoutePhone) },
  { id: 'nextStep', desk: desk(nextStepDesk), phone: phone(nextStepPhone) },
  { id: 'tracker', desk: desk(trackerDesk), phone: phone(trackerPhone) },
  { id: 'setupWhere', desk: desk(setupWhereDesk), phone: phone(setupWherePhone) },
  { id: 'setupInside', desk: desk(setupInsideDesk), phone: phone(setupInsidePhone) },
  { id: 'shifts', desk: desk(shiftsDesk), phone: phone(shiftsPhone) },
  { id: 'closing', desk: desk(closingDesk), phone: phone(closingPhone) },
];

/** The slides for what is loaded: a save file with no player ID has no My runs tab and ends at Follow this route (lib/firstTour.ts stepsFor). */
export function slidesFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourSlide[] {
  const ids = stepsFor(p);
  return TOUR_SLIDES.filter(s => ids.includes(s.id));
}
