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
import followDesk from '@/assets/tour/4-follow-desk.webp';
import followPhone from '@/assets/tour/4-follow-phone.webp';
import trackerDesk from '@/assets/tour/5-tracker-desk.webp';
import trackerPhone from '@/assets/tour/5-tracker-phone.webp';
import setupDesk from '@/assets/tour/6-setup-desk.webp';
import setupPhone from '@/assets/tour/6-setup-phone.webp';

/** The files behind each slide (src/assets/tour/). Slide 5 is the Build-up tracker (Jordan, 9 Nov 2026). */
export const TOUR_IMAGES: Record<TourStepId, { desk: string; phone: string }> = {
  load: { desk: '1-load-desk.webp', phone: '1-load-phone.webp' },
  goal: { desk: '2-goal-desk.webp', phone: '2-goal-phone.webp' },
  answer: { desk: '3-answer-desk.webp', phone: '3-answer-phone.webp' },
  follow: { desk: '4-follow-desk.webp', phone: '4-follow-phone.webp' },
  myruns: { desk: '5-tracker-desk.webp', phone: '5-tracker-phone.webp' },
  setup: { desk: '6-setup-desk.webp', phone: '6-setup-phone.webp' },
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
  { id: 'follow', desk: desk(followDesk), phone: phone(followPhone) },
  { id: 'myruns', desk: desk(trackerDesk), phone: phone(trackerPhone) },
  { id: 'setup', desk: desk(setupDesk), phone: phone(setupPhone) },
];

/** The slides for what is loaded: a save file with no player ID ends at Follow this route (lib/firstTour.ts stepsFor). */
export function slidesFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourSlide[] {
  const ids = stepsFor(p);
  return TOUR_SLIDES.filter(s => ids.includes(s.id));
}
