/**
 * Every word of the first-visit tour (spec-firsttour, 8 Nov 2026), final (Words, 9 Nov 2026); v2 (spec-firsttour2, 9 Nov
 * 2026: the welcome box and the slideshow of pictures) adds the welcome words and the pictures' alt text, and rewords two
 * captions for pictures; final (Words, 9 Nov 2026). Edit here, the components only read these names. Wording only, so never part of the result hash (src/lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { TourStepId } from './firstTour';

/** Each slide's title (read first on each slide) and caption, which says everything without the picture. load and answer
 *  reworded for the slideshow (v2): the pictures show a sample account, not the visitor's. */
export const FIRST_TOUR_STEPS: Record<TourStepId, { title: string; body: string }> = {
  // Tour v3 (Words, 16 Nov 2026, notes/words-tour-v3-and-c3-2026-11-16.md): the tabs show only after a save loads, so their
  // slides say what each is and never "press". Titles are DRAFT.
  tabManual: { title: 'Manual Planner', body: 'Manual Planner is where you build a plan by hand, one step at a time.' },
  tabAuto: { title: 'Auto Planner', body: 'Auto Planner works out one ascension for you, from your save and your settings.' },
  tabChain: { title: 'Chain Finder', body: 'Chain Finder looks for the best route across many ascensions.' },
  tabMyruns: { title: 'My runs', body: 'My runs is where you follow the route you keep.' },
  load: {
    title: 'Load your save',
    body: 'Enter your player ID, or load a save file, so the planner works from your real account.',
  },
  goalTarget: { title: 'Target TE', body: 'Target TE finds the fastest way to a TE you choose.' },
  goalDate: { title: 'By a date', body: 'By a date finds the most TE you can reach by a date, such as Egg Day.' },
  date: { title: 'The finish date', body: 'This is the date you would finish, worked out from your save.' },
  firstStep: { title: 'First step', body: 'The First step line tells you what to do first, and when.' },
  // The button beside Follow this route on the answer (spec-simpler2).
  simulate: {
    title: 'Simulate this plan',
    body: "Simulate this plan opens the route in the Auto Planner, which plays it out shift by shift: when each TE comes, with every ascension's dates and buys.",
  },
  follow: { title: 'Follow this route', body: 'Press Follow this route to keep it.' },
  tracker: {
    title: 'The Build-up tracker',
    body: 'The Build-up tracker lists what to buy and when. Tick each one off as you go.',
  },
  // Setup as two slides, where it is, then what is inside (spec-simpler2).
  setupWhere: {
    title: 'Where Setup is',
    body: 'Setup is the round gear button at the bottom of the screen (a Setup button at the right on a computer). Press it any time, or drag it out of the way.',
  },
  setup: {
    title: 'Inside Setup',
    body: 'Inside it: your awake hours, so prestiges wait for you. The filters button just above the answer opens it too.',
  },
  moreWhere: { title: 'More', body: 'More is the fold with the Fast, Exact and Custom searches inside.' },
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
  tabManual: 'The Manual Planner tab along the top of the page, enlarged, with an arrow pointing at it.',
  tabAuto: 'The Auto Planner tab along the top of the page, enlarged, with an arrow pointing at it.',
  tabChain: 'The Chain Finder tab along the top of the page, enlarged, with an arrow pointing at it.',
  tabMyruns: 'The My runs tab along the top of the page, enlarged, with an arrow pointing at it.',
  load: 'The player ID box with its Load Player Data button, and the save-file button, each with an arrow pointing at it.',
  goalTarget: "The Target TE side of Chain Finder's goal switch, enlarged, with an arrow pointing at it.",
  goalDate: "The By a date side of Chain Finder's goal switch, enlarged, with an arrow pointing at it.",
  date: "A sample instant answer's finish date, enlarged, with an arrow pointing at it.",
  firstStep: "A sample instant answer's First step line, enlarged, with an arrow pointing at it.",
  simulate: 'The Simulate this plan button beside Follow this route on the instant answer, enlarged, with an arrow pointing at it.',
  follow: 'The Follow this route button under the instant answer, enlarged, with an arrow pointing at it.',
  tracker: "A sample account's Build-up tracker heading on My runs, enlarged, with an arrow pointing at it: check-ins done and the next one.",
  setupWhere: 'The round gear Setup button at the bottom of the screen, enlarged, with an arrow pointing at it.',
  setup: "The Setup panel open, with its awake hours (Any hour or My awake hours), enlarged, with an arrow pointing at it.",
  moreWhere: 'The closed More fold at the bottom of Chain Finder, enlarged, with an arrow pointing at it.',
};
