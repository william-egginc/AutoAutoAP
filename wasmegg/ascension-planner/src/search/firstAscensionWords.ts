/**
 * Setup's First ascension choices (spec-fluff3-chrome): moved word for word out of search/firstAscension.ts, so they
 * can be reworded without moving the result code hash (lib/resultCodeHash.ts: src/search is an input, a *Words.ts
 * file is not). Only YourSetup.vue reads them.
 */
import type { FirstAscension } from './firstAscension';

/** Your setup's four choices, in order. */
export const FIRST_ASCENSION_CHOICES: readonly { value: FirstAscension; label: string; blurb: string }[] = [
  {
    value: 'auto',
    // "Soonest", not "Fastest": the goal is called Fastest to 490 TE (glossary Q5, its suggested name; ux review
    // 26 Oct, row 19).
    label: 'Soonest (default)',
    blurb:
      'Works out all three: keep building from where your farm is, stop buying and just lay, or prestige now. Takes whichever finishes first.',
  },
  {
    value: 'buildup',
    label: 'Continue my build-up',
    blurb:
      'Carries on from your farm as it is now, finishing the build (habs, vehicles, research through the coming sales), then lays out the ascension.',
  },
  {
    value: 'continue',
    label: 'Finish without buying',
    blurb:
      "No more purchases: your farm lays at today's rate until the ascension ends. Right when your build is already done. If that takes over a week, a fresh start that is strictly faster still wins.",
  },
  {
    value: 'fresh',
    label: 'Prestige now',
    blurb: 'Prestiges straight away: the first ascension is a fresh one.',
  },
];
