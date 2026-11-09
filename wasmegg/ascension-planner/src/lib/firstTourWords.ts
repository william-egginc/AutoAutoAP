/**
 * Every word of the first-visit tour (spec-firsttour, 8 Nov 2026), final (Words, 9 Nov 2026): edit here, the components
 * only read these names. Wording only, so never part of the result hash (src/lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { TourStepId } from './firstTour';

/** Each step's card: its title (the dialog's name) and one or two plain sentences. */
export const FIRST_TOUR_STEPS: Record<TourStepId, { title: string; body: string }> = {
  load: {
    title: 'Load your save',
    body: 'Type your player ID and press Load Player Data, or load a save file. The tour goes on once your save is in.',
  },
  goal: {
    title: 'Pick a goal',
    body: 'Highest TE by a date plans for the most TE by a date such as Egg Day. Fastest to 490 TE finds the quickest way to 490 TE. You can switch any time.',
  },
  answer: {
    title: 'The instant answer',
    body: 'This is your answer, worked out ahead of time: when you finish, your TE stops and your first step. The searches under it check it on your save.',
  },
  follow: {
    title: 'Follow this route',
    body: 'Press Follow this route to keep it. My runs then shows where you are on it and what to do next.',
  },
  myruns: {
    title: 'My runs and the tracker',
    body: 'My runs shows where you are now and what to do next. The Build-up tracker lists what to buy and when, so you can tick it off as you go.',
  },
  setup: {
    title: 'Setup',
    body: 'Setup is where you set your awake hours, so prestiges wait for you, and Save online, so your followed route and choices show on every device.',
  },
};

/** Step 5 while the My runs tab isn't there yet (nothing followed): said instead of its body. */
export const FIRST_TOUR_MYRUNS_NOT_YET = 'My runs appears up here once you follow a route. It shows where you are now and what to do next.';
/** The last card's closing line. */
export const FIRST_TOUR_CLOSING = "That's the tour. You can show it again from the foot of the page or from Setup.";

export const FIRST_TOUR_BACK = 'Back';
export const FIRST_TOUR_NEXT = 'Next';
export const FIRST_TOUR_DONE = 'Done';
export const FIRST_TOUR_SKIP = 'Skip tour';
export const FIRST_TOUR_REMIND = 'Remind me later';
/** The footer's and Setup's link. */
export const FIRST_TOUR_REPLAY = 'Show the tour again';

/** The card's step line: "Step 2 of 6", and without a save "Step 2 of 6 · after your save loads". */
export function firstTourLabel(n: number, of: number, beforeSave: boolean): string {
  return `Step ${n} of ${of}${beforeSave ? ' · after your save loads' : ''}`;
}
/** Said to a screen reader on each step. */
export function firstTourAnnounce(n: number, of: number, title: string): string {
  return `Tour, step ${n} of ${of}: ${title}`;
}
