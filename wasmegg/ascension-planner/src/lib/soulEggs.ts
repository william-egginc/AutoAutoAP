/**
 * Soul eggs a plan's shifts would leave (the math review's second check, 24 Oct 2026, finding 15: "SE exhaustion is
 * silent"). Each shift costs soul eggs, rising with the cube of the shift count (lib/shiftCost.ts), and the count only
 * goes back to 0 with a Path reset (aaap-tools game-mechanics.md §7). Stepped exactly from 0 shifts, what is left is
 * 97% after 60, 69% after 120, 24% after 168, 6% after 200 and 0.2% after 240, for any soul eggs from 1e15 to 1e24
 * (the review's numbers; soulEggs.spec.ts holds them). That is the formula itself, not a curve fitted to it, so no
 * interpolation: `soulEggsLeft` pays each shift out of what is left, as `plannedShiftsCost` does, earning none.
 *
 * Under a quarter left, one plain amber line says so (SoulEggWarning.vue); it never blocks anything.
 *
 * My runs also says what is left after the followed route (27 Oct 2026, Jordan: Single run shows "Soul eggs: −3.0s,
 * remaining 9.7s"): `soulEggsAfterLine`, one plain line, amber under the same quarter.
 */
import { formatNumber } from './format';
import { plannedShiftsCost } from './shiftCost';

/** Under this share of soul eggs left, the plan says so. */
export const SE_WARN_BELOW = 0.25;
/** The shift count from a Path reset where less than a quarter is left (24.6% at 1e21 soul eggs; 25.4% at 167). */
export const QUARTER_SHIFTS = 168;
/** Soul eggs to price with when the save's aren't known: the share left barely moves with them (above). */
export const NOMINAL_SOUL_EGGS = 1e21;

/** The share of `soulEggs` left after `count` more shifts, with `done` made since the last Path reset. */
export function soulEggsLeft(done: number, count: number, soulEggs?: number | null): number {
  const se = soulEggs != null && soulEggs > 0 ? soulEggs : NOMINAL_SOUL_EGGS;
  const spent = plannedShiftsCost(se, Math.max(0, Math.floor(done)), count);
  return Math.max(0, 1 - spent / se);
}

export interface SoulEggPlan {
  /** The plan's shifts (from its simulated legs); null when the plan doesn't keep them. */
  planShifts: number | null;
  /** The save's shifts since its last Path reset (the backup's `virtue.shiftCount`); null when there is no save. */
  done: number | null;
  /** The save's soul eggs; absent or null: priced at `NOMINAL_SOUL_EGGS`. */
  soulEggs?: number | null;
}

function percent(left: number): string {
  // Rounded down, so a line that only shows under 25% never says "about 25%".
  return left < 0.01 ? 'under 1%' : `about ${Math.floor(left * 100)}%`;
}

const s = (n: number) => (n === 1 ? '' : 's');

/** The amber line, or '' when the plan leaves a quarter or more (or its shifts aren't known). */
export function soulEggWarning(p: SoulEggPlan): string {
  if (p.planShifts == null || !(p.planShifts > 0)) return '';
  const plan = Math.floor(p.planShifts);
  const left = soulEggsLeft(p.done ?? 0, plan, p.soulEggs);
  if (left >= SE_WARN_BELOW) return '';
  const tail = `Past about ${QUARTER_SHIFTS} shifts since a Path reset, less than a quarter is left.`;
  if (p.done == null)
    return `This plan has ${plan} shift${s(plan)}, which in this plan alone would leave ${percent(left)} of your soul eggs (counted from 0 shifts: your save's shifts since your last Path reset aren't known here). ${tail}`;
  const done = Math.max(0, Math.floor(p.done));
  return `This plan has about ${done + plan} shifts since your last Path reset (${done} in your save, ${plan} in the plan), which would leave ${percent(left)} of the soul eggs you have now. ${tail}`;
}

/**
 * "You'll have about 10.4s soul eggs left when this plan is done (about 2.3s goes on 41 shifts · about 24 of the 41 are
 * build-up shifts, estimated)" (My runs' Right now and its saved answer tile; worded plainer 28 Oct 2026, pieha):
 * today's soul eggs less the planned shifts' cost (`plannedShiftsCost` from the save's `done` shifts, as All planned
 * shifts prices them), each number as Single run writes its Spent / Remaining (`formatNumber(x, 1)`). `opening`: how
 * many of the shifts are the estimated build-up shifts (lib/openingShifts.ts). `amber` under SE_WARN_BELOW left, the
 * warning's threshold. Null without the save's soul eggs or a planned count.
 */
export function soulEggsAfterLine(p: {
  soulEggs: number | null | undefined;
  done: number | null | undefined;
  /** `cost`: the planned shifts' cost as All planned shifts has it (useNowPage `plannedShifts`, the one source); absent:
   *  priced here the same way. */
  planned: { count: number; cost?: number; opening?: number } | null | undefined;
}): { text: string; amber: boolean } | null {
  const se = p.soulEggs;
  if (se == null || !(se > 0) || !p.planned || !Number.isFinite(p.planned.count)) return null;
  const count = Math.max(0, Math.floor(p.planned.count));
  const done = Math.max(0, Math.floor(p.done ?? 0));
  const given = p.planned.cost;
  const spent = given != null && Number.isFinite(given) && given >= 0 ? given : plannedShiftsCost(se, done, count);
  const left = Math.max(0, se - spent);
  const opening = p.planned.opening ?? 0;
  const est = opening > 0 ? ` · about ${opening} of the ${count} are build-up shifts, estimated` : '';
  const tail = count === 0 ? 'no shifts planned' : `about ${formatNumber(spent, 1)} goes on ${count} shift${s(count)}${est}`;
  return {
    text: `You'll have about ${formatNumber(left, 1)} soul eggs left when this plan is done (${tail})`,
    amber: soulEggsLeft(done, count, se) < SE_WARN_BELOW,
  };
}

/**
 * The All planned shifts tile on Your eggs (ux34-a, 28 Oct 2026, plainer): "41 shifts" over "will cost about 2.3s soul
 * eggs (at today's prices), about 18 of them build-up shifts (estimated)". The same count and cost as
 * `soulEggsAfterLine` above (both from useNowPage `plannedShifts`), the cost written as it writes it. `opening`: the
 * estimated build-up shifts included (lib/openingShifts.ts); `partial`: only the instant answer's shifts, none added.
 */
export function plannedShiftsWords(p: { count: number; cost: number; opening?: number; partial?: boolean }): { value: string; note: string } {
  const count = Math.max(0, Math.floor(p.count));
  if (count === 0) return { value: 'no shifts planned', note: '' };
  const opening = Math.max(0, Math.floor(p.opening ?? 0));
  const tail =
    opening > 0
      ? count === 1
        ? ', a build-up shift (estimated)'
        : `, about ${opening} of them ${opening === 1 ? 'a build-up shift' : 'build-up shifts'} (estimated)`
      : p.partial
        ? ", the shifts listed, without each new ascension's first hours"
        : '';
  return {
    value: `${count} shift${s(count)}`,
    note: `will cost about ${formatNumber(p.cost, 1)} soul eggs (at today's prices)${tail}`,
  };
}
