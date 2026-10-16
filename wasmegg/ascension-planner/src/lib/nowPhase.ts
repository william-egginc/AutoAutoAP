/**
 * Right now's corner badge (16 Oct 2026): Building or Producing, with the egg laying rate beside it. Saved data
 * only: the plan's own shifts and the save's equipped set (lib/gearMatch.ts). Pure.
 *
 *   Building    the build steps before Joo's H1 step (the shift to Humility followed straight by Kindness, when the
 *               artifacts are swapped) in the plan's current ascension; without a timeline, wearing the earnings set
 *   Producing   after the H1 step; without a timeline, wearing the production (delivery-rate) set
 *
 * The rate: the save's own (lib/farmFacts.ts) when the save wears the set of that phase, else for Producing (and for
 * Building on "a mix") the plan's projected peak rate of this ascension (`LegSummary.maxELR`, after K3), labelled
 * "projected".
 * Not on virtue (or not known yet): no badge.
 */
import { formatNumber } from './format';
import type { SetMatch } from './gearMatch';
import { ascensionAt, type NowPlan } from './nowPlan';

export interface PhaseBadge {
  phase: 'building' | 'producing';
  /** Eggs per second; null: none to show. */
  elr: number | null;
  /** Where the rate is from. */
  elrFrom: 'save' | 'projected' | null;
}

/** The H1 step's moment in a leg's shifts (Humility, then straight to Kindness); null when the leg has none. */
export function h1At(shifts: readonly { at: number; egg: string }[] | undefined): number | null {
  if (!shifts) return null;
  for (let i = 0; i + 1 < shifts.length; i++)
    if (shifts[i].egg === 'humility' && shifts[i + 1].egg === 'kindness' && Number.isFinite(shifts[i].at))
      return shifts[i].at;
  return null;
}

/** Building or Producing from the plan's current ascension; null when the plan can't tell. */
function phaseFromPlan(plan: NowPlan | null, nowSeconds: number): { phase: PhaseBadge['phase']; leg: number } | null {
  if (!plan?.legs) return null;
  const asc = ascensionAt(plan, nowSeconds);
  if (asc < 1) return null;
  const leg = plan.legs[asc - 1];
  const at = h1At(leg?.shifts);
  if (at == null) return null;
  return { phase: nowSeconds < at ? 'building' : 'producing', leg: asc - 1 };
}

export function phaseNow(o: {
  onVirtue: boolean | null;
  plan: NowPlan | null;
  nowSeconds: number;
  setMatch: SetMatch;
  /** The save's eggs per second with its equipped set (farmFacts `elr`); null when not known. */
  saveElr: number | null;
}): PhaseBadge | null {
  if (o.onVirtue !== true) return null;
  const fromPlan = phaseFromPlan(o.plan, o.nowSeconds);
  const phase: PhaseBadge['phase'] | null =
    fromPlan?.phase ?? (o.setMatch === 'production' ? 'producing' : o.setMatch === 'earnings' ? 'building' : null);
  if (!phase) return null;
  const wears = o.setMatch === 'both' || o.setMatch === (phase === 'building' ? 'earnings' : 'production');
  if (wears && o.saveElr != null && o.saveElr > 0) return { phase, elr: o.saveElr, elrFrom: 'save' };
  // Producing without its set on, and Building on "a mix": the plan's projected rate when it has legs.
  if ((phase === 'producing' || o.setMatch === 'mix') && o.plan?.legs) {
    const i = fromPlan?.leg ?? Math.max(0, ascensionAt(o.plan, o.nowSeconds) - 1);
    const max = o.plan.legs[i]?.maxELR;
    if (typeof max === 'number' && max > 0) return { phase, elr: max, elrFrom: 'projected' };
  }
  return { phase, elr: null, elrFrom: null };
}

/** The badge's words: "Building", "Producing"; the rate "1.234Q/hr · from your save" or "… · projected". */
export function phaseWords(b: PhaseBadge): { title: string; rate: string } {
  const title = b.phase === 'building' ? 'Building' : 'Producing';
  if (b.elr == null) return { title, rate: '' };
  const rate = `${formatNumber(b.elr * 3600, 3)}/hr`;
  return { title, rate: b.elrFrom === 'projected' ? `${rate} · projected` : `${rate} · from your save` };
}
