/**
 * Every word of the first-visit tour (spec-firsttour, 8 Nov 2026), final (Words, 9 Nov 2026); v2 (spec-firsttour2, 9 Nov
 * 2026: the welcome box and the slideshow of pictures) adds the welcome words and the pictures' alt text, and rewords two
 * captions for pictures; final (Words, 9 Nov 2026). Edit here, the components only read these names. Wording only, so never part of the result hash (src/lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { TourStepId } from './firstTour';

/** Each slide's title (read first on each slide) and caption, which says everything without the picture. load and answer
 *  reworded for the slideshow (v2): the pictures show a sample account, not the visitor's. */
export const FIRST_TOUR_STEPS: Record<TourStepId, { title: string; body: string }> = {
  load: {
    title: 'Load your save',
    body: 'Type your player ID and press Load Player Data, or load a save file. Everything else works from your save.',
  },
  goal: {
    title: 'Pick a goal',
    body: 'Highest TE by a date plans for the most TE by a date such as Egg Day. Fastest to 490 TE finds the quickest way to 490 TE. You can switch any time.',
  },
  answer: {
    title: 'The instant answer',
    body: "Your answer shows up quickly, worked out ahead of time: the finish date, each stop's TE and your first step. The rest of the page is under More.",
  },
  // The button beside Follow this route on the answer (spec-simpler2).
  simulate: {
    title: 'Simulate this plan',
    body: "Simulate this plan opens the route in Single run, which plays it out shift by shift: when each TE comes, with every ascension's dates and buys.",
  },
  follow: {
    title: 'Follow this route',
    body: 'Press Follow this route to keep it. My runs then shows where you are on it and what to do next.',
  },
  myruns: {
    title: 'My runs and the tracker',
    body: 'My runs shows where you are now and what to do next. The Build-up tracker lists what to buy and when, so you can tick it off as you go.',
  },
  // Setup as two slides, where it is, then what is inside (spec-simpler2).
  setupWhere: {
    title: 'Where Setup is',
    body: 'Setup is the button at the bottom of the screen (at the right on a computer), on the Auto Planner and My runs. Press it any time.',
  },
  setup: {
    title: 'Inside Setup',
    body: 'Inside it: your awake hours, so prestiges wait for you, and Save online, so your followed route and choices show on every device.',
  },
  // DRAFT (spec-tourmore, 9 Nov 2026), for Words: More, then the Fast and Custom searches inside it.
  moreWhere: {
    title: 'More',
    body: 'Everything else on a screen is under More, at the bottom. To have it all open every time, tick Show everything in Setup › More options.',
  },
  moreInside: {
    title: 'Inside More',
    body: "Inside: the answer's filters, every number of ascensions with its own route, and the Search card to check the answer on your save.",
  },
  fast: {
    title: 'A Fast search',
    body: 'Fast checks routes near the instant answer with the full planner on your save. Its time here is on the button; you can stop it and keep the best.',
  },
  custom: {
    title: 'A Custom search',
    body: 'Custom tries every route in boxes you set, so it proves the best inside them. Big boxes take hours.',
  },
};

/** The last card's closing line. */
export const FIRST_TOUR_CLOSING = "That's the tour. You can show it again from the foot of the page or from Setup.";

export const FIRST_TOUR_BACK = 'Back';
export const FIRST_TOUR_NEXT = 'Next';
export const FIRST_TOUR_DONE = 'Done';
export const FIRST_TOUR_SKIP = 'Skip tour';
export const FIRST_TOUR_REMIND = 'Remind me later';
/** The footer's and Setup's link. */
export const FIRST_TOUR_REPLAY = 'Show the tour again';

/** The slide's step line: "Step 2 of 6". */
export function firstTourLabel(n: number, of: number): string {
  return `Step ${n} of ${of}`;
}
/** Said to a screen reader on each step. */
export function firstTourAnnounce(n: number, of: number, title: string): string {
  return `Tour, step ${n} of ${of}: ${title}`;
}

/** The welcome box on a first visit (v2). */
export const FIRST_TOUR_WELCOME = {
  label: 'First visit',
  title: 'Welcome to the Ascension Planner',
  body: 'It plans your virtue ascensions: the fastest route to 490 TE, or the most TE by a date such as Egg Day. Want a short tour of how it works?',
  take: 'Take the tour',
  skip: 'Skip',
  /** Closes the box (the tour counts as done) and goes to the player ID box. */
  load: 'Load my save',
};

/** Each picture's alt text: what is highlighted, on the sample account; no numbers from the sample (v2). */
export const FIRST_TOUR_ALT: Record<TourStepId, string> = {
  load: 'The player ID box, the Load Player Data button and the save-file button, highlighted.',
  goal: 'The goal tabs, highlighted: Fastest to 490 TE, Highest TE by a date and Single run.',
  answer: 'A sample instant answer, highlighted: the finish date, the TE stops and the first step.',
  simulate: 'The Simulate this plan button beside Follow this route on the instant answer, highlighted.',
  follow: 'The Follow this route button under the instant answer, highlighted.',
  myruns: "A sample account's Build-up tracker on My runs, highlighted: check-ins done and the next one, with today's buys below.",
  setupWhere: 'The Setup button at the bottom of the screen, highlighted.',
  setup: 'The Setup panel open, highlighted: the sample account, its save time and the awake hours.',
  // DRAFT (spec-tourmore), for Words.
  moreWhere: 'The closed More fold at the bottom of Fastest to 490 TE, highlighted.',
  moreInside: "More open, highlighted: the answer's filters and Prefer fewer ascensions at its top, then the table of every number of ascensions.",
  fast: 'The Fast choice in the Search card inside More, highlighted, with its time here.',
  custom: 'The Custom choice in the Search card inside More, highlighted.',
};
