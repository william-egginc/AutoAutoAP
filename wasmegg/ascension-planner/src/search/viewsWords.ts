/**
 * The Other options views' hints (search/views.ts `VIEWS`), moved here unchanged so they can be reworded without moving
 * the result code hash (UX fluff review 2, 5 Nov 2026, item M6; a *Words.ts file is wording only, lib/resultCodeHash.ts
 * `isWordingOnly`).
 */
export const VIEW_HINTS = {
  'balanced':
    'The leader, the best route at each other ascension count, then whatever else is a genuinely ' +
    'different plan rather than the same one nudged by a few TE. Anything more than five days ' +
    'behind is left out here. Switch to "Fastest" to see the raw ranking.',
  'fastest':
    'The outright quickest routes this run priced, in order, with nothing filtered out. Expect ' +
    'near-duplicates: a descent sweep prices dozens of routes differing by one TE, and they are ' +
    'all really the same plan.',
  'cheapest-hours':
    'Sorted by how much of the plan is spent waiting for you (prestiges held plus shifts held) ' +
    'instead of by total length. The fastest route is rarely the one that asks least of you, and ' +
    'a route that costs you two fewer days of waiting may be worth half a day of plan.',
  'per-count':
    'The best route at every ascension count the run saw, shortest route first. Each prestige is a ' +
    'full rebuild (twelve shifts and a fresh research grind), so one fewer for half a day is a ' +
    'trade worth seeing plainly.',
  'finish-days':
    'One route per calendar day it could finish on, earliest first. Useful when a date matters more ' +
    'than a duration: several routes finishing the same morning are one choice, not four.',
} as const;
