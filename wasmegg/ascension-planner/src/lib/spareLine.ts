/**
 * By a date's "to spare" in the answer's green box (InstantRoute.vue), and when it is tight.
 *
 * Tight is under a day to spare: a slower ascension than planned, or a late start, misses the date. When the gear
 * caveat that moves the date ("Up to about 5 days later than shown", lib/answerCaveat.ts, the form G) shows for the
 * answer, the spare is tight inside that window too, and says it may be none on the player's gear (Jordan, 26 Oct
 * 2026; the UX review's item 2 and note 2: "5.50 days to spare" in green beside "about 5 to 6 days later").
 */
import { GEAR_CAVEAT_DAYS } from './answerCaveat';
import { headlineGap } from './format';

/** Under a day to spare is tight, caveat or not. */
export const TIGHT_SECONDS = 86400;

export interface SpareLine {
  /** "5.5 days to spare", "3 days to spare, maybe none on your gear". */
  text: string;
  /** Amber, with the "tight" tag. */
  tight: boolean;
}

/** Inside the gear caveat's window: the spare may be none on the player's gear. */
const inGearWindow = (spareSeconds: number, gearCaveat: boolean) => gearCaveat && spareSeconds < GEAR_CAVEAT_DAYS * 86400;

/** THE test for the box's tight tag (ux34-c, 28 Oct 2026; Prefer fewer's pick does not use it since ux35-c). */
export function isTightSpare(spareSeconds: number, gearCaveat = false): boolean {
  return spareSeconds < TIGHT_SECONDS || inGearWindow(spareSeconds, gearCaveat);
}

/** The spare as the box shows it; `gearCaveat`: the gear caveat with the days window shows for this answer. */
export function spareLine(spareSeconds: number, gearCaveat: boolean, locale?: string): SpareLine {
  const inWindow = inGearWindow(spareSeconds, gearCaveat);
  return {
    text: `${headlineGap(spareSeconds, locale)} to spare${inWindow ? ', maybe none on your gear' : ''}`,
    tight: isTightSpare(spareSeconds, gearCaveat),
  };
}
