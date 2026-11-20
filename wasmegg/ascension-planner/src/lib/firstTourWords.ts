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
  tabAuto: { title: 'Auto Planner', body: 'The \'Auto Planner\' builds a full plan for you from your save.' },
  tabChain: { title: 'Chain Finder', body: 'Chain Finder looks for the best route by comparing routes with different numbers of ascensions. Click Next to learn more about Chain Finder.' },
  tabMyruns: { title: 'My Runs', body: '\'My Runs\' is your dashboard for your chain. It has your ascension plan, and you can add calendar reminders from this page.' },
  load: { title: 'Load Your Save', body: 'Enter your Player ID or load a save file, so the planner works from your real account.' },
  goalTarget: { title: 'Goals', body: 'There are two different goals you can pick: \'Target TE\' & \'By a Date\'. Target TE finds the fastest ascension plan to obtain an amount of TE you choose; \'By a Date\' calculates how much TE you can get by a certain date. Both goals display chains for \'N\' number of ascensions.' },
  goalDate: { title: 'By a Date', body: 'By a date finds the most TE you can reach by a date, such as Egg Day.' },
  result: { title: 'The Instant Answer', body: 'The \'Instant Answer\' shows you the date you would achieve your goal, how long it would take, and the chain you should follow.' },
  filters: { title: 'The Setup Button', body: 'The Setup button opens Setup, where you set what the answer is worked out for.' },
  setupAwake: { title: 'Awake Hours', body: 'Awake hours are when you can play. Prestiges and shifts wait for them, so no step lands while you sleep.' },
  setupTimeOff: { title: 'No Prestige Days and Time Off', body: 'No prestige days are days you play but do not prestige. Time off is days away on the home farm. The route plans around both.' },
  prefer: { title: 'Prefer Fewer Ascensions', body: 'Prefer fewer ascensions picks a route with fewer ascensions when it costs you only a little: finishing a bit later, or reaching a bit less TE.' },
  simulate: { title: 'Simulate This Route', body: "Simulate this route opens the route in the Auto Planner, which plays it out shift by shift, with every ascension's dates and buys." },
  follow: { title: 'Follow This Route', body: 'Clicking \'Follow This Route\' saves the selected chain to \'My Runs\' to track your progress and follow along after you have decided upon your chain.' },
  myrunsPage: { title: 'My Runs', body: '\'My Runs\' is the dashboard for your chain. From this page you can see your ascension plan, and you can add calendar reminders.' },
  followedRoute: { title: 'The route you follow', body: 'This is the route you follow: the TE you reach at the end of each ascension.' },
  nextStep: { title: 'Next step', body: 'Next step says what to do now, and when, such as buying or prestiging. It updates when you load a newer save.' },
  tracker: { title: 'The Build-up tracker', body: 'The Build-up tracker lists what to buy and when, so you can tick each one off as you go.' },
  setupWhere: { title: 'Setting up Awake Hours', body: 'To set your awake hours or days off, click Setup on the right, or the round gear button at the bottom of the screen.' },
  setupInside: { title: 'Inside Setup', body: 'Setup holds your awake hours, time off and Save online. The planner works out every answer from them.' },
  shifts: { title: 'The shifts', body: 'The shifts are listed on My Runs, each with when it happens and how far away it is.' },
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
  tabMyruns: 'The My Runs tab along the top of the page, enlarged, with an arrow pointing at it.',
  load: 'The player ID box with its Load Player Data button, and the save-file button, each with an arrow pointing at it.',
  goalTarget: "The Target TE side of Chain Finder's goal switch, enlarged, with an arrow pointing at it.",
  goalDate: "The By a date side of Chain Finder's goal switch, enlarged, with an arrow pointing at it.",
  result: "A sample Instant Answer box, whole: its heading, finish date, route and both buttons, with an arrow pointing at it.",
  filters: 'The button that opens Setup, enlarged, with an arrow pointing at it.',
  setupAwake: 'The awake hours choice at the top of the Setup panel (Any hour or My awake hours), enlarged, with an arrow pointing at it.',
  setupTimeOff: 'The No prestige days and Time off boxes in the Setup panel, with an arrow pointing at them.',
  prefer: 'The Prefer fewer ascensions row under the filters button, with its choices, with an arrow pointing at it.',
  simulate: 'The Simulate this route button beside Follow this route on the Instant Answer, enlarged, with an arrow pointing at it.',
  follow: 'The Follow this route button under the Instant Answer, enlarged, with an arrow pointing at it.',
  myrunsPage: 'The My Runs page, open and dimmed, with the My Runs tab ringed and an arrow pointing at it.',
  followedRoute: 'The line on My Runs that shows the route you follow, with an arrow pointing at it.',
  nextStep: 'The Next step box on My Runs, with its heading and what to do next, and an arrow pointing at it.',
  tracker: "A sample account's Build-up tracker heading on My Runs, with an arrow pointing at it: check-ins done and the next one.",
  setupWhere: 'The round gear Setup button at the bottom of the screen, enlarged, with an arrow pointing at it.',
  setupInside: 'The Setup panel open, showing its top part, with an arrow pointing at it.',
  shifts: 'The list of upcoming shifts and prestiges on My Runs, with an arrow pointing at it.',
  closing: 'The Full tour link inside the open More fold, enlarged, with an arrow pointing at it.',
};
