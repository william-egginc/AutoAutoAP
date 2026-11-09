/**
 * Every word of the first-visit tour (spec-firsttour, 8 Nov 2026). ALL DRAFT, for Words: edit here, the components
 * only read these names. Wording only, so never part of the result hash (src/lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { TourStepId } from './firstTour';

/** Each step's card: its title (the dialog's name) and one or two plain sentences. DRAFT. */
export const FIRST_TOUR_STEPS: Record<TourStepId, { title: string; body: string }> = {
  load: {
    title: 'Load your save',
    body: 'Type your player ID and press Load Player Data, or load a save file. The tour carries on when your save is in.',
  },
  goal: {
    title: 'Pick a goal',
    body: 'Highest TE by a date plans the most TE you can reach by a date such as Egg Day. Fastest to 490 TE finds the quickest way to 490. Switch any time.',
  },
  answer: {
    title: 'The instant answer',
    body: 'Your answer, worked out ahead of time: the finish date, the TE stops and your first step. The searches under it check it with the full simulator.',
  },
  follow: {
    title: 'Follow this route',
    body: 'Press Follow this route to keep it. My runs then shows where you are on it and what to do next.',
  },
  myruns: {
    title: 'My runs and the tracker',
    body: 'My runs shows where you are now and your next steps. The Build-up tracker lists each research buy with its time, to tick off as you go.',
  },
  setup: {
    title: 'Setup',
    body: 'Your awake hours, so prestiges wait for you, and Save online, so your followed routes and choices show on every device.',
  },
};

/** Step 5 while the My runs tab isn't there yet (nothing followed): said instead of its body. DRAFT. */
export const FIRST_TOUR_MYRUNS_NOT_YET = 'My runs appears up here once you follow a route. It shows where you are now and your next steps, with the Build-up tracker.';
/** The last card's closing line. DRAFT. */
export const FIRST_TOUR_CLOSING = "That's the tour. Show it again any time from the foot of the page or Setup.";

export const FIRST_TOUR_BACK = 'Back';
export const FIRST_TOUR_NEXT = 'Next';
export const FIRST_TOUR_DONE = 'Done';
export const FIRST_TOUR_SKIP = 'Skip tour';
export const FIRST_TOUR_REMIND = 'Remind me later';
/** The footer's and Setup's link. DRAFT. */
export const FIRST_TOUR_REPLAY = 'Show the tour again';

/** The card's step line: "Step 2 of 6", and without a save "Step 2 of 6 · after your save loads". DRAFT. */
export function firstTourLabel(n: number, of: number, beforeSave: boolean): string {
  return `Step ${n} of ${of}${beforeSave ? ' · after your save loads' : ''}`;
}
/** Said to a screen reader on each step. DRAFT. */
export function firstTourAnnounce(n: number, of: number, title: string): string {
  return `Tour, step ${n} of ${of}: ${title}`;
}
