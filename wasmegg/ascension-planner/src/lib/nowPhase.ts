/**
 * Right now's corner badge (16 Oct 2026): Building or Producing, with the egg laying rate beside it. Saved data
 * only: the save's equipped set (lib/gearMatch.ts) and the plan's own shifts. Pure.
 *
 * The save wins (30 Oct 2026, alt A1: the badge flipped with which request finished first, because a stale followed
 * route's simulated legs still had a future H1 step):
 *   Producing   the save wears the production (delivery-rate) set
 *   Building    the save wears the earnings set
 * Only when the set can't say (a mix, or the two sets are the same) does the plan decide, and only when it agrees
 * with the save: the plan's egg at now (its simulated legs, lib/planPace.ts `planEggAt`) is the save's egg. Then
 * Building before Joo's H1 step (the shift to Humility followed straight by Kindness, when the artifacts are swapped)
 * in the plan's current ascension, Producing after it. Otherwise no badge.
 *
 * The rate: the save's own (lib/farmFacts.ts) when the save wears the set of that phase, else for Producing (and for
 * Building on "a mix") the plan's projected peak rate of this ascension (`LegSummary.maxELR`, after K3), labelled
 * "projected".
 * Not on virtue (or not known yet): no badge.
 */
import { formatNumber } from './format';
import type { SetMatch } from './gearMatch';
import { ascensionAt, type NowPlan } from './nowPlan';
import { planEggAt } from './planPace';

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

/** The plan agrees with the save: its simulated legs put it on the save's egg at `nowSeconds`. */
export function planAgrees(plan: NowPlan | null, nowSeconds: number, saveEgg: string | null): boolean {
  if (!plan?.legs || !saveEgg) return false;
  return planEggAt(plan.legs.slice(0, plan.chain.length), nowSeconds) === saveEgg;
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
  /** The egg the save's farm is on (lib/virtueEggs.ts `virtueEggOf`); null when not known (the plan is not used). */
  saveEgg: string | null;
  /** The save's eggs per second with its equipped set (farmFacts `elr`); null when not known. */
  saveElr: number | null;
}): PhaseBadge | null {
  if (o.onVirtue !== true) return null;
  const plan = planAgrees(o.plan, o.nowSeconds, o.saveEgg) ? o.plan : null;
  const fromPlan = phaseFromPlan(plan, o.nowSeconds);
  const phase: PhaseBadge['phase'] | null =
    o.setMatch === 'production' ? 'producing' : o.setMatch === 'earnings' ? 'building' : (fromPlan?.phase ?? null);
  if (!phase) return null;
  const wears = o.setMatch === 'both' || o.setMatch === (phase === 'building' ? 'earnings' : 'production');
  if (wears && o.saveElr != null && o.saveElr > 0) return { phase, elr: o.saveElr, elrFrom: 'save' };
  // Not wearing that phase's set (a mix), or no rate from the save: the agreeing plan's projected rate.
  if (plan?.legs) {
    const i = fromPlan?.leg ?? Math.max(0, ascensionAt(plan, o.nowSeconds) - 1);
    const max = plan.legs[i]?.maxELR;
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
