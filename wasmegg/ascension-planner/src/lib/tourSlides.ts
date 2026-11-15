/**
 * The first-visit tour's slideshow (spec-firsttour2, 9 Nov 2026; design ~/code/aaap-tools/notes/tutorial-v2-design.md):
 * one picture per step, a real screen of a sample account ("Sample": a scrubbed save, no player ID) with everything but
 * the step's part greyed out, baked in. Made by ~/code/aaap-tools/harness-r7/tutorial-v2/make-tour-images.mjs (its
 * README says when to rerun it: whenever one of these screens changes). Imported, so vite fingerprints them; the page
 * asks for them only when the slideshow shows, and a <picture> fetches one set (desk from 640 px, phone below).
 * Nothing the result hash covers imports this file.
 */
import { stepsFor, type TourStepId } from './firstTour';
import loadDesk from '@/assets/tour/1-load-desk.webp';
import loadPhone from '@/assets/tour/1-load-phone.webp';
import goalDesk from '@/assets/tour/2-goal-desk.webp';
import goalPhone from '@/assets/tour/2-goal-phone.webp';
import answerDesk from '@/assets/tour/3-answer-desk.webp';
import answerPhone from '@/assets/tour/3-answer-phone.webp';
import simulateDesk from '@/assets/tour/4-simulate-desk.webp';
import simulatePhone from '@/assets/tour/4-simulate-phone.webp';
import followDesk from '@/assets/tour/5-follow-desk.webp';
import followPhone from '@/assets/tour/5-follow-phone.webp';
import trackerDesk from '@/assets/tour/6-tracker-desk.webp';
import trackerPhone from '@/assets/tour/6-tracker-phone.webp';
import setupWhereDesk from '@/assets/tour/7-setup-where-desk.webp';
import setupWherePhone from '@/assets/tour/7-setup-where-phone.webp';
import setupDesk from '@/assets/tour/8-setup-desk.webp';
import setupPhone from '@/assets/tour/8-setup-phone.webp';
import moreWhereDesk from '@/assets/tour/9-more-where-desk.webp';
import moreWherePhone from '@/assets/tour/9-more-where-phone.webp';
import moreInsideDesk from '@/assets/tour/10-more-inside-desk.webp';
import moreInsidePhone from '@/assets/tour/10-more-inside-phone.webp';
import fastDesk from '@/assets/tour/11-fast-desk.webp';
import fastPhone from '@/assets/tour/11-fast-phone.webp';
import customDesk from '@/assets/tour/12-custom-desk.webp';
import customPhone from '@/assets/tour/12-custom-phone.webp';

/** The files behind each slide (src/assets/tour/). Slide 6 is the Build-up tracker (Jordan, 9 Nov 2026); 4 (Simulate
 *  this plan) and 7 (where Setup is) since spec-simpler2. */
export const TOUR_IMAGES: Record<TourStepId, { desk: string; phone: string }> = {
  load: { desk: '1-load-desk.webp', phone: '1-load-phone.webp' },
  goal: { desk: '2-goal-desk.webp', phone: '2-goal-phone.webp' },
  answer: { desk: '3-answer-desk.webp', phone: '3-answer-phone.webp' },
  simulate: { desk: '4-simulate-desk.webp', phone: '4-simulate-phone.webp' },
  follow: { desk: '5-follow-desk.webp', phone: '5-follow-phone.webp' },
  myruns: { desk: '6-tracker-desk.webp', phone: '6-tracker-phone.webp' },
  setupWhere: { desk: '7-setup-where-desk.webp', phone: '7-setup-where-phone.webp' },
  setup: { desk: '8-setup-desk.webp', phone: '8-setup-phone.webp' },
  // spec-tourmore (9 Nov 2026): More closed, More open, then Fast and Custom in its Search card.
  moreWhere: { desk: '9-more-where-desk.webp', phone: '9-more-where-phone.webp' },
  moreInside: { desk: '10-more-inside-desk.webp', phone: '10-more-inside-phone.webp' },
  fast: { desk: '11-fast-desk.webp', phone: '11-fast-phone.webp' },
  custom: { desk: '12-custom-desk.webp', phone: '12-custom-phone.webp' },
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
  { id: 'load', desk: desk(loadDesk), phone: phone(loadPhone) },
  { id: 'goal', desk: desk(goalDesk), phone: phone(goalPhone) },
  { id: 'answer', desk: desk(answerDesk), phone: phone(answerPhone) },
  { id: 'simulate', desk: desk(simulateDesk), phone: phone(simulatePhone) },
  { id: 'follow', desk: desk(followDesk), phone: phone(followPhone) },
  { id: 'myruns', desk: desk(trackerDesk), phone: phone(trackerPhone) },
  { id: 'setupWhere', desk: desk(setupWhereDesk), phone: phone(setupWherePhone) },
  { id: 'setup', desk: desk(setupDesk), phone: phone(setupPhone) },
  { id: 'moreWhere', desk: desk(moreWhereDesk), phone: phone(moreWherePhone) },
  { id: 'moreInside', desk: desk(moreInsideDesk), phone: phone(moreInsidePhone) },
  { id: 'fast', desk: desk(fastDesk), phone: phone(fastPhone) },
  { id: 'custom', desk: desk(customDesk), phone: phone(customPhone) },
];

/** The slides for what is loaded: a save file with no player ID ends at Follow this route (lib/firstTour.ts stepsFor). */
export function slidesFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourSlide[] {
  const ids = stepsFor(p);
  return TOUR_SLIDES.filter(s => ids.includes(s.id));
}
