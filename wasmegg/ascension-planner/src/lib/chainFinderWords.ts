/**
 * Chain Finder's words (spec-chainfinder, 12 Nov 2026). ALL DRAFT, for Words to review. The tab's name is NAMES.chainFinder
 * and the simulator's NAMES.classic (lib/siteNav.ts). Wording only, so never part of the result hash.
 */
import type { ChainView } from './siteNav';
import { NAMES } from './siteNav';

export const CHAIN_FINDER_WORDS = {
  /** The switch's own name, read by a screen reader ("Goal, radio group"). DRAFT. */
  switchLabel: 'Goal',
  /** The two sides, as on Joo's Chain Finder. DRAFT. */
  goals: { fastest: 'Target TE', 'by-date': 'By a date' } as Record<ChainView, string>,
  /** The dot on a side whose search is running (was on the old goal tabs, unchanged). */
  running: 'A search is running here',
  /** The Auto Planner's intro, under its heading (was Single run's, in App.vue). DRAFT. */
  autoPlannerIntro: (fastest: string): string =>
    `The ${NAMES.classic} is Joo's original planner: type the TE you want to ascend at and it lays out every ascension from your start, with the weekly Research Sale and the Monday 2× earnings boost in it. To have the stops found for you, use ${NAMES.chainFinder} (${fastest} or ${NAMES.byDate}).`,
};
