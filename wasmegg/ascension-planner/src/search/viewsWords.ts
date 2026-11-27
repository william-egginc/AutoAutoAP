/**
 * The Other options views' hints (search/views.ts `VIEWS`), moved here unchanged so they can be reworded without moving
 * the result code hash (UX fluff review 2, 5 Nov 2026, item M6; a *Words.ts file is wording only, lib/resultCodeHash.ts
 * `isWordingOnly`).
 */
/** One line each (UX fluff review 2, item M6; DRAFT, Words). The views' long hints said what the view leaves out and why;
 *  the leader-and-spread rule is search/shortlist.ts's own documentation. */
export const VIEW_HINTS = {
  balanced: 'The leader, the best at each other ascension count, then other genuinely different plans within five days.',
  fastest: 'The quickest routes priced, in order, unfiltered: expect near-duplicates.',
  'cheapest-hours': 'Sorted by the time spent waiting for you, not by total length.',
  'per-count': 'The best route at each ascension count, shortest first.',
  'finish-days': 'One route per day it could finish on, earliest first.',
} as const;
