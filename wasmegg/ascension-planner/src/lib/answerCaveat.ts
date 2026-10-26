/**
 * ONE line of caveat under an answer, with the rest behind "Why? ›" (Jordan, 25 Oct 2026; the UX review's item 3).
 *
 * The instant answer's date had three qualifiers around it, each saying a different direction of error: the bracket
 * line above ("no sooner than Jun 4, 2029"), the gear note below ("up to about 5 days later than shown") and the
 * low-TE note ("rough"). Now the answer carries one plain sentence, built from the strongest caveat in effect, and a
 * closed "Why? ›" that lists every caveat in full, in the words each had before (Words owns them).
 *
 * THE PRIORITY ORDER (CAVEAT_ORDER), by what matters most to the player's decision:
 *   1. gear          the answer is not on the player's gear (a shift of days over the route, or a few percent below
 *                    full research, or optimistic): the date itself moves;
 *   2. bound         the bracket from the closest gear on the site: how far the date can be from the truth;
 *   3. lowTe         the low-TE opening: only the first ascensions' dates are rough;
 *   4. experimental  a hint that has had few checks (the "Prestige by" line's evidence).
 * Ties keep the order the caller gave. Pure: the screens build the caveats and render the result.
 */

export type CaveatKind = 'gear' | 'bound' | 'lowTe' | 'experimental';

/** Most important first. */
export const CAVEAT_ORDER: readonly CaveatKind[] = ['gear', 'bound', 'lowTe', 'experimental'];

export interface Caveat {
  kind: CaveatKind;
  /** The caveat's full words, as they were shown on their own. */
  text: string;
  /** One plain sentence for the line under the answer; the full text is used when left out. */
  line?: string;
}

export interface AnswerCaveat {
  /** The one line under the answer. */
  line: string;
  /** Every caveat's full words, in priority order, for "Why? ›". The lead's own is left out only when the line
   *  already is its full text (nothing more to say about it). Empty: no "Why? ›". */
  more: string[];
}

/** The line and its "Why?" list, or null when no caveat is in effect. Falsy entries and empty texts are skipped. */
export function answerCaveat(caveats: ReadonlyArray<Caveat | null | undefined | false>): AnswerCaveat | null {
  const live = caveats.filter((c): c is Caveat => !!c && !!c.text.trim());
  if (!live.length) return null;
  const rank = (c: Caveat) => CAVEAT_ORDER.indexOf(c.kind);
  const sorted = live
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(x => x.c);
  const lead = sorted[0];
  const line = lead.line?.trim() || lead.text;
  const more = sorted.filter(c => c !== lead || line !== c.text).map(c => c.text);
  return { line, more };
}

/** How much later than shown a form G answer can finish, in days: the gear caveat's "up to about 5 days later" (words
 *  review W1-12). By a date's box calls its spare tight inside this window when that caveat shows (`gearTightSeconds`). */
export const GEAR_CAVEAT_DAYS = 5;

/** What the instant answer's gear note says (GearCaveat.vue renders these; the "Why?" list joins them). */
export interface GearCaveatInput {
  /** The answer is the form G: the maxed table moved to the player's gear. */
  gearShift?: boolean;
  /** The player's gear is not the instant answer's, below full research. */
  gearDiffers: boolean;
  /** "May be optimistic for your gear" (lib/optimisticAnswer.ts). */
  optimistic: boolean;
  bonusShort: number;
  deliveryScale: number | null;
  fullResearchTe: number;
}

/** The words GearCaveat.vue shows: the main sentence(s), and the optimistic label (bold there). */
export function gearCaveatParts(p: GearCaveatInput, optimisticText: string): { main: string; optimistic: string } {
  if (p.gearShift)
    return {
      main:
        "Your gear isn't one the instant answers were built for, so this answer is the fully maxed one adjusted to your " +
        "gear's rate (about 1–2% off per ascension). Over a whole route that adds up: in checks on one account, the route " +
        `it picked finished up to about ${GEAR_CAVEAT_DAYS} days later than shown. Fast gives your real date.`,
      optimistic: '',
    };
  const main = p.gearDiffers
    ? "Your gear isn't the gear the instant answer was built on (" +
      (p.bonusShort > 0.05 ? `earnings set ${p.bonusShort.toFixed(2)} Clothed TE short, ` : '') +
      `delivery ${((p.deliveryScale ?? 1) * 100).toFixed(1)}% of its rate at full research). Ascensions that start ` +
      `below about TE ${p.fullResearchTe} can take a few percent more or less than these, and may need a longer build ` +
      '(one more research sale) than shown: your earnings set, and how your delivery gear does before research is ' +
      "complete, aren't fully taken off. From there up they match. A Fast search gives your own times."
    : '';
  return { main, optimistic: p.optimistic ? optimisticText : '' };
}

/** The gear caveat for answerCaveat, or null when GearCaveat would show nothing. */
export function gearCaveat(p: GearCaveatInput, optimisticText: string): Caveat | null {
  const { main, optimistic } = gearCaveatParts(p, optimisticText);
  const text = [main, optimistic].filter(Boolean).join(' ');
  if (!text) return null;
  const line = p.gearShift
    ? `Up to about ${GEAR_CAVEAT_DAYS} days later than shown: your gear isn't one the instant answers were built for.`
    : p.gearDiffers
      ? `Ascensions below about TE ${p.fullResearchTe} can take a few percent more or less: your gear isn't the gear the instant answer was built on.`
      : optimistic;
  return { kind: 'gear', text, line };
}

/** The low-TE opening as a caveat (search/instantIntegrity.ts lowTeOpeningNote is the full text). */
export function lowTeCaveat(text: string): Caveat | null {
  return text
    ? {
        kind: 'lowTe',
        text,
        line: "Dates for your low-TE ascensions are rough: this account can't max its habs in one round of research, vehicles and habs.",
      }
    : null;
}
