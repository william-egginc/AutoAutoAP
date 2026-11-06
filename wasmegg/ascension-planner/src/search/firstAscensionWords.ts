/**
 * Setup's First ascension choices (spec-fluff3-chrome): moved word for word out of search/firstAscension.ts, so they
 * can be reworded without moving the result code hash (lib/resultCodeHash.ts: src/search is an input, a *Words.ts
 * file is not). Only YourSetup.vue reads them. Since spec-fluff3-chrome (UX fluff review 2, S12) only Soonest has a
 * blurb, a clause after its label; the names say the rest.
 */
import type { FirstAscension } from './firstAscension';

/** Your setup's four choices, in order. */
export const FIRST_ASCENSION_CHOICES: readonly { value: FirstAscension; label: string; blurb: string }[] = [
  {
    value: 'auto',
    // "Soonest", not "Fastest": the goal is called Fastest to 490 TE (glossary Q5, its suggested name; ux review
    // 26 Oct, row 19).
    label: 'Soonest (default)',
    // A clause after the label (UX fluff review 2, S12, DRAFT for Words); the other choices say it in their names.
    blurb: 'whichever finishes first: keep building, just lay, or prestige now.',
  },
  {
    value: 'buildup',
    label: 'Continue my build-up',
    blurb: '',
  },
  {
    value: 'continue',
    label: 'Finish without buying',
    blurb: '',
  },
  {
    value: 'fresh',
    label: 'Prestige now',
    blurb: '',
  },
];
