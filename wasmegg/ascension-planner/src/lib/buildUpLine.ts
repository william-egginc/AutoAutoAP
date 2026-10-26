/**
 * THE BUILD-UP, ONE LINE (26 Oct 2026, Jordan). The instant answer's shifts start at H1 (search/legShifts.ts): a fresh
 * ascension's opening shifts are not in the table, so the Full timeline (components/myruns/AscensionList.vue) says
 * what that opening is for at the start of each ascension: "You do the build-up for 2 sales, then start producing at
 * 3.574q/hr".
 *
 * The sale count comes from the leg's variant ('2-sale-tier13' → 2; search/types.ts VariantKey, routeFinder.ts
 * RouteLeg.label); 'continue' and 'buildup' carry on the save's own farm and have no build-up of their own: no line.
 * The rate is the table's (RouteLeg.peakELR, the cell's BuildParams.peakELR) or the simulated leg's peak
 * (LegSummary.maxELR), eggs per second, written per hour as Right now's phase badge writes it (lib/nowPhase.ts). A
 * number that is not known is left out, never guessed: no rate → the sales alone; no sale count → no line. Pure.
 */
import { formatNumber, plural } from './format';

export interface BuildUpLeg {
  /** The simulated leg's variant (LegSummary.key); wins over `label`. */
  variant?: string | null;
  /** The table leg's 'continue', '2-sale', '1-sale-tier13' (RouteLeg.label). */
  label?: string | null;
  /** Eggs per second once built. */
  peakELR?: number | null;
}

/** The sales a variant's build waits through: '3-sale-tier13' → 3; null for 'continue', 'buildup' or anything else. */
export function buildUpSales(variant: string | null | undefined): number | null {
  const m = /^([1-9])-sale(?:-tier13)?$/.exec(variant ?? '');
  return m ? Number(m[1]) : null;
}

/** Eggs per second as the page writes a rate: "3.574q/hr". */
export function ratePerHour(eggsPerSecond: number): string {
  return `${formatNumber(eggsPerSecond * 3600, 3)}/hr`;
}

/** "You do the build-up for 2 sales, then start producing at 3.574q/hr", the sales alone without a rate, null without
 *  a sale count. */
export function buildUpLine(leg: BuildUpLeg | null | undefined): string | null {
  if (!leg) return null;
  const sales = buildUpSales(leg.variant ?? leg.label);
  if (sales === null) return null;
  const head = `You do the build-up for ${plural(sales, 'sale')}`;
  const r = leg.peakELR;
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? `${head}, then start producing at ${ratePerHour(r)}` : head;
}
