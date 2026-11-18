/**
 * Every word of the first-visit tour (spec-firsttour, 8 Nov 2026), final (Words, 9 Nov 2026); v2 (spec-firsttour2, 9 Nov
 * 2026: the welcome box and the slideshow of pictures) adds the welcome words and the pictures' alt text, and rewords two
 * captions for pictures; final (Words, 9 Nov 2026). Edit here, the components only read these names. Wording only, so never part of the result hash (src/lib/resultCodeHash.ts `isWordingOnly`).
 */
import type { TourStepId } from './firstTour';

/** Each slide's title (read first on each slide) and caption, which says everything without the picture. load and answer
 *  reworded for the slideshow (v2): the pictures show a sample account, not the visitor's. */
export const FIRST_TOUR_STEPS: Record<TourStepId, { title: string; body: string }> = {
  // Tour v3 (Words, 16 Nov 2026, notes/words-tour-v3-and-c3-2026-11-16.md, the full text after Jordan's review). Each says what its
  // thing is FOR. The tabs show only after a save loads, so their slides never say "press". Titles are DRAFT; gear, followedRoute
  // and shifts are DRAFT too (written to what the picture shows: see the note to Words).
  tabManual: { title: 'Manual Planner', body: 'Manual Planner is where you build a plan by hand, one step at a time.' },
  tabAuto: { title: 'Auto Planner', body: 'Auto Planner works out your best route from your save: the fastest to 490 TE, or the most TE by a date. It plays the route out shift by shift.' },
  tabChain: { title: 'Chain Finder', body: 'Chain Finder looks for the best route across many ascensions. Click Next to learn more about Chain Finder.' },
  tabMyruns: { title: 'My runs', body: 'My runs is where you follow the route you keep.' },
  load: { title: 'Load your save', body: 'Enter your player ID, or load a save file, so the planner works from your real account.' },
  goalTarget: { title: 'Target TE', body: 'Target TE finds the fastest way to a TE you choose.' },
  goalDate: { title: 'By a date', body: 'By a date finds the most TE you can reach by a date, such as Egg Day.' },
  result: { title: 'The result', body: 'This is the result: when you would finish, and the TE you would reach. It is worked out from your save.' },
  filters: { title: 'The Setup button', body: 'The Setup button opens Setup, where you set what the answer is worked out for.' },
  setupAwake: { title: 'Awake hours', body: 'Awake hours are when you can play. Prestiges and shifts wait for them, so no step lands while you sleep.' },
  setupTimeOff: { title: 'No prestige days and Time off', body: 'No prestige days are days you play but do not prestige. Time off is days away on the home farm. The route plans around both.' },
  prefer: { title: 'Prefer fewer ascensions', body: 'Prefer fewer ascensions picks a route with fewer ascensions when it costs you only a little: finishing a bit later, or reaching a bit less TE.' },
  simulate: { title: 'Simulate this route', body: "Simulate this route opens the route in the Auto Planner, which plays it out shift by shift, with every ascension's dates and buys." },
  follow: { title: 'Follow this route', body: 'Follow this route saves it to My runs, so the planner can track your check-ins and tell you the next step.' },
  myrunsPage: { title: 'My runs', body: 'My runs is where the route you follow lives, and where the planner tells you what to do next.' },
  followedRoute: { title: 'The route you follow', body: 'This is the route you follow: the TE you reach at the end of each ascension.' },
  nextStep: { title: 'Next step', body: 'Next step says what to do now, and when, such as buying or prestiging. It updates when you load a newer save.' },
  tracker: { title: 'The Build-up tracker', body: 'The Build-up tracker lists what to buy and when, so you can tick each one off as you go.' },
  setupWhere: { title: 'Where Setup is', body: 'Setup is where you set your awake hours and time off. It is the round gear button at the bottom of the screen, or a Setup button at the right on a wide screen.' },
  setupInside: { title: 'Inside Setup', body: 'Setup holds your awake hours, time off and Save online. The planner works out every answer from them.' },
  shifts: { title: 'The shifts', body: 'The shifts are listed on My runs, each with when it happens and how far away it is.' },
  closing: { title: 'That is the tour', body: 'That is the important part. For everything else, open More and take the Full tour.' },
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
/** The page footer's two tour links (17 Nov 2026, Jordan: either tour from any page; More › Full tour and About keep theirs). */
export const FOOTER_QUICK_TOUR = 'Quick tour';
export const FOOTER_FULL_TOUR = 'Full tour';

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
  result: "A sample instant answer's finish date, enlarged, with an arrow pointing at it.",
  filters: 'The button that opens Setup, enlarged, with an arrow pointing at it.',
  setupAwake: 'The awake hours choice at the top of the Setup panel (Any hour or My awake hours), enlarged, with an arrow pointing at it.',
  setupTimeOff: 'The No prestige days and Time off boxes in the Setup panel, with an arrow pointing at them.',
  prefer: 'The Prefer fewer ascensions row under the filters button, with its choices, with an arrow pointing at it.',
  simulate: 'The Simulate this route button beside Follow this route on the instant answer, enlarged, with an arrow pointing at it.',
  follow: 'The Follow this route button under the instant answer, enlarged, with an arrow pointing at it.',
  myrunsPage: 'The My runs page, open and dimmed, with the My runs tab ringed and an arrow pointing at it.',
  followedRoute: 'The line on My runs that shows the route you follow, with an arrow pointing at it.',
  nextStep: 'The Next step box on My runs, with its heading and what to do next, and an arrow pointing at it.',
  tracker: "A sample account's Build-up tracker heading on My runs, with an arrow pointing at it: check-ins done and the next one.",
  setupWhere: 'The round gear Setup button at the bottom of the screen, enlarged, with an arrow pointing at it.',
  setupInside: 'The Setup panel open, showing its top part, with an arrow pointing at it.',
  shifts: 'The list of upcoming shifts and prestiges on My runs, with an arrow pointing at it.',
  closing: 'The Full tour link inside the open More fold, enlarged, with an arrow pointing at it.',
};
