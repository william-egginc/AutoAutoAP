/**
 * Every word of the full tour (spec-fulltour, 14 Nov 2026). Words' cards (~/code/aaap-tools/notes/words-calendar-and-
 * fulltour-2026-11-14.md), each body within the first tour's cap (169 characters, at most 3 sentences), "Press" not Click.
 * Four cards differ from Words' draft because the screen does something else (reported to Words; theirs to reword): the
 * tabs' order (the real row), the chip (it shows the name only, and opens the player box), the filters button (it opens
 * Setup; the ascension boxes sit under it) and the black box (a downloaded file after a stopped visit, in More). The
 * Leaderboard card says where you share (a finished result) and hide (My runs, Leaderboard › Mine). Wording only, so
 * never part of the result hash.
 */
import type { FullTourStepId } from './fullTour';

export const FULL_TOUR_STEPS_WORDS: Record<FullTourStepId, { title: string; body: string }> = {
  tabs: {
    title: 'The tabs',
    body: 'The tabs along the top are Manual Planner, Auto Planner, Chain Finder, My runs, Leaderboard and Science. Chain Finder is the one to start with.',
  },
  chip: {
    title: 'Your player chip',
    body: 'The chip shows whose save is loaded. Press it to switch account or load a fresh save; the player box opens above.',
  },
  saveBlock: {
    title: 'Is your save fresh?',
    body: 'A banner tells you when your save is getting old. While your farm runs on its own, the planner counts no earnings, so load a fresh save.',
  },
  switch: {
    title: 'Target TE | By a date',
    body: 'Target TE finds the fastest way to a TE you pick. By a date finds the highest TE by a day such as Egg Day. Press the question mark beside it for what it means.',
  },
  filters: {
    title: 'More filters in Setup',
    body: 'The button above the answer opens Setup for more filters. Ascensions from and to, and Prefer fewer ascensions, sit under it and change the answer at once.',
  },
  answer: {
    title: 'The instant answer',
    body: "The finish date, each stop's TE and the first step, worked out ahead of time. Press a row to see its ascension. A close call is marked, so run Custom to confirm.",
  },
  followSim: {
    title: 'Follow or Simulate',
    body: 'Follow this route keeps it, so My runs can track it. Simulate this plan plays it out in the Auto Planner, shift by shift.',
  },
  rightNow: {
    title: 'My runs',
    body: "Right now says what you're doing. Next step says what to do next. The Build-up tracker lists buys to tick off, and Your eggs shows your shifts.",
  },
  dock: {
    title: 'The Setup button',
    body: 'Setup opens from the round button. Drag it where you like, and double-click it to put it back.',
  },
  more: {
    title: 'More',
    body: 'More is the fold at the bottom of each screen. It holds the Search card and extra detail, and you can keep it open from Setup.',
  },
  blackBox: {
    title: 'The black box',
    body: 'If a search stops without finishing, More offers the black box: a file of what it was doing, with no player ID. Download it and send it to the maintainer.',
  },
  leaderboard: {
    title: 'The Leaderboard',
    body: "Leaderboard shows other players' runs, Egg Day first. Share yours from a finished result, if you want to, and hide it later from My runs.",
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
  dock: 'The round Setup button floating at the bottom of the screen, highlighted.',
  more: 'The closed More fold at the foot of the screen, highlighted.',
  blackBox: 'The notice offering to download the black box, highlighted.',
  leaderboard: 'The Leaderboard screen, highlighted.',
};

export const FULL_TOUR_CLOSING = 'That is everything. Show it again any time from More › Full tour.';
/** The entries: More's item, the first tour's last card, About's line (Words). */
export const FULL_TOUR_ITEM = 'Full tour';
export const FULL_TOUR_FROM_FIRST = 'More: Full tour';
export const FULL_TOUR_ABOUT = 'Want more than the short tour? Open More and pick Full tour for every part of the planner.';

/** Said to a screen reader on each step. */
export const fullTourAnnounce = (n: number, of: number, title: string): string => `Full tour, step ${n} of ${of}: ${title}`;
