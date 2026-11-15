/**
 * Every word of the full tour (spec-fulltour, 14 Nov 2026). DRAFT: Words owns the final text. Each card's body stays within
 * the first tour's cap (169 characters, lib/firstTourWords.spec.ts), in plain words, "Press" for what you do. Wording only,
 * so never part of the result hash.
 */
import type { FullTourStepId } from './fullTour';

export const FULL_TOUR_STEPS_WORDS: Record<FullTourStepId, { title: string; body: string }> = {
  tabs: {
    title: 'The tabs',
    body: 'The tabs are the page headings: Manual Planner, Auto Planner, Chain Finder, My runs, Leaderboard and Science. The lit one is where you are.',
  },
  chip: {
    title: 'Your account',
    body: 'The chip shows whose save is loaded. Press it to switch player or load another save; the player box opens above.',
  },
  saveBlock: {
    title: 'How fresh your save is',
    body: 'Top right of the card: how old your save is, and when your silos run out. Amber means old or low. Details and Load latest save are inside.',
  },
  switch: {
    title: 'Target TE | By a date',
    body: 'Target TE finds the quickest way to a TE such as 490. By a date finds the most TE by a date such as Egg Day. The ? beside it says what the page does.',
  },
  filters: {
    title: 'More filters in Setup',
    body: 'This button opens Setup for more filters. Ascensions from and to, and Prefer fewer ascensions, sit right under it and change the answer at once.',
  },
  answer: {
    title: 'The instant answer',
    body: "The finish date, each stop's TE and a short first step, worked out ahead of time so it shows at once. Every number of ascensions is below it.",
  },
  followSim: {
    title: 'Follow and Simulate',
    body: 'Follow this route keeps it, so My runs can track it. Simulate this plan opens it in the Auto Planner and plays it out shift by shift.',
  },
  rightNow: {
    title: 'Right now and Next step',
    body: 'On My runs, Right now shows where you are, and Next step says what to do next, such as a prestige, a shift or a buy, and when.',
  },
  tracker: {
    title: 'The Build-up tracker',
    body: 'The tracker lists every check-in of the build: what to buy and when. Tick each one as you do it. Compact view fits more on screen.',
  },
  eggs: {
    title: 'Your eggs',
    body: "Your eggs, on My runs under the tracker, shows each egg's TE and facts about your farm, all read from your save.",
  },
  dock: {
    title: 'The Setup button',
    body: 'Setup floats at the bottom of the screen. Drag it out of the way. Press it for your awake hours, Save online and the rest.',
  },
  more: {
    title: 'More',
    body: 'More is the fold at the foot of each screen, closed until you open it. It holds the Search card and the rest of what the page can do.',
  },
  blackBox: {
    title: 'The black box',
    body: 'If a search stops without finishing, the page offers the black box: a file of what it was doing. Download it and send it to the maintainer.',
  },
  leaderboard: {
    title: 'The Leaderboard',
    body: 'The Leaderboard lists runs that players chose to share. You share one only by pressing a share button yourself.',
  },
};

/** Each picture's alt text: what is highlighted, on the sample account. */
export const FULL_TOUR_ALT: Record<FullTourStepId, string> = {
  tabs: 'The row of tabs at the top, highlighted, with Chain Finder lit.',
  chip: "The account chip under the tabs, highlighted, showing the sample account's name.",
  saveBlock: "The save's age and the silo line, highlighted, at the top right of the Target TE card.",
  switch: 'The Target TE | By a date switch and the ? beside it, highlighted.',
  filters: 'The button that opens more filters in Setup, highlighted, with the filters under it.',
  answer: 'The instant answer, highlighted: the finish date, the TE stops and the short first step.',
  followSim: 'The Follow this route and Simulate this plan buttons under the instant answer, highlighted.',
  rightNow: 'The Right now card on My runs, highlighted, with its Next step.',
  tracker: "A sample account's Build-up tracker on My runs, highlighted.",
  eggs: 'The Your eggs card on My runs, highlighted.',
  dock: 'The round Setup button floating at the bottom of the screen, highlighted.',
  more: 'The closed More fold at the foot of the screen, highlighted.',
  blackBox: 'The notice offering to download the black box, highlighted.',
  leaderboard: 'The Leaderboard screen, highlighted.',
};

export const FULL_TOUR_CLOSING = 'That is everything. Show it again any time from More › Full tour.';
/** The entries: More's item, the first tour's last card, About's line. */
export const FULL_TOUR_ITEM = 'Full tour';
export const FULL_TOUR_FROM_FIRST = 'More: Full tour';
export const FULL_TOUR_ABOUT = 'Want to see where everything is? Open More on any screen and press Full tour.';

/** Said to a screen reader on each step. */
export const fullTourAnnounce = (n: number, of: number, title: string): string => `Full tour, step ${n} of ${of}: ${title}`;
