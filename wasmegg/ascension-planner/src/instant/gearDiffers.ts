/**
 * "Your gear isn't the table's" (ported from the AutoAutoAP fork's InstantRoute.vue `gearDiffers`).
 * The delivery scale (deliveryScale.ts) is worked out at full research, but how much research a build
 * reaches depends on what it earns and the hour it starts, so below FULL_RESEARCH_TE the answer can be
 * a few percent off either way. On the test account (19 Oct, scale 93.6%) the route shown as 855.1 d
 * took 862.4 d in the Auto Planner: its 3-sale tier-13 leg at TE 196 ran at 0.80 of the table's rate,
 * not 0.94 (aaap-tools/notes/joofork-accuracy.md).
 */
import type { ei } from 'lib';
import { cteFromArtifacts } from 'lib/virtue';
import { getOptimalEarningsSet } from '@/lib/artifacts';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { TableKind } from './tableChoice';

/**
 * The start TE from which the table's builds hold for any gear: the build reaches full research, so
 * the delivery adjustment is exact and the earnings set stops mattering. Measured on the board's legs
 * (1 Oct): from 340 every account is exact (median 0.00%, 90th percentile at most 0.02%, 168k legs).
 * At 300-339 accounts that earn less than the table's need one more sale week on many legs (7-57% of
 * identical legs, by account); at 245-251 the earnings set costs ~0.3% of leg time per Clothed TE
 * point and delivery gear on incomplete research is off by 1-2.6% either way.
 */
export const FULL_RESEARCH_TE = 340;

/** The save's best earnings set's Clothed TE bonus; 0 without a save. */
export function earningsBonus(backup: ei.IBackup | null | undefined): number {
  if (!backup) return 0;
  const set = getOptimalEarningsSet(backup);
  return set.length ? cteFromArtifacts(equippedArtifactsToLibArtifacts(set)) : 0;
}

/** How far the save's gear is from the table's: Clothed TE short (> 0: short), and the delivery scale. */
export interface GearGap {
  bonusShort: number;
  scale: number;
}

/** The gear is not the table's account's, and the route starts where that shows. */
export function gearDiffers(startTE: number, gap: GearGap): boolean {
  return Math.floor(startTE) < FULL_RESEARCH_TE && (gap.bonusShort > 0.05 || Math.abs(gap.scale - 1) > 0.005);
}

/** The caveat, in a player's words. */
export function gearDiffersText(gap: GearGap): string {
  const short = gap.bonusShort > 0.05 ? `earnings set ${gap.bonusShort.toFixed(2)} Clothed TE short, ` : '';
  return (
    `Your gear isn’t the gear the instant answer was built on (${short}delivery ${(gap.scale * 100).toFixed(1)}% of ` +
    `its at full research). Ascensions that start below about TE ${FULL_RESEARCH_TE} can take a few percent more or ` +
    `less than these, and may need a longer build (one more research sale) than shown: your earnings set, and how ` +
    `your delivery gear does before research is complete, aren’t fully taken off. From there up they match. ` +
    `“Import into the planner” gives your own times.`
  );
}

/** The caveat on a table read with the earnings shift (a delivery table, or the maxed one shifted)
 *  when the save's epic research or colleggtibles aren't maxed. */
export const RESEARCH_BELOW_MAX_TEXT =
  'Your epic research or colleggtibles aren’t maxed, which these tables assume, so times can be a little off.';

/** The caveat on a delivery table, or the maxed one read with the earnings shift, when the save's
 *  delivery stones are weaker than the table's T4 (deliveryTables.ts: its cells are scaled to the
 *  save's rate, but a build's research and sales were worked out at the table's). */
export const STONES_BELOW_T4_TEXT =
  'Your delivery stones are lower tier than these tables assume, so times can be a little off.';

/** The delivery scale below which the stones are said to be weaker than the table's. */
export const WEAK_STONES_SCALE = 0.995;

/**
 * The caveat under the answer, by the table the first ascension starts on (tableChoice.ts answeredBy):
 * the maxed table keeps its gear caveat (`maxedCaveat`, gearDiffersText or null); a delivery or
 * earnings-shifted table says that research is below max, when it is, and that the delivery stones
 * are below the table's (`weakStones`), when they are, as two sentences; a table built on the save's
 * own account or exact gear says nothing.
 */
export function tableCaveat(
  by: TableKind,
  maxedCaveat: string | null,
  belowMax: boolean,
  weakStones = false
): string | null {
  if (by === 'maxed') return maxedCaveat;
  if (by === 'delivery' || by === 'maxed-shift') {
    const said = [belowMax ? RESEARCH_BELOW_MAX_TEXT : null, weakStones ? STONES_BELOW_T4_TEXT : null].filter(Boolean);
    return said.length ? said.join(' ') : null;
  }
  return null;
}

/** The save's delivery stones are weaker than a delivery table's: a stone below T4 in its set, or its
 *  delivery rate below the table's (`ownScale` under WEAK_STONES_SCALE). */
export function weakDeliveryStones(stonesBelowT4: boolean | undefined, ownScale: number): boolean {
  return !!stonesBelowT4 || ownScale < WEAK_STONES_SCALE;
}
