/**
 * Soul eggs a plan's shifts would leave (the math review's second check, 24 Oct 2026, finding 15: "SE exhaustion is
 * silent"). Each shift costs soul eggs, rising with the cube of the shift count (lib/shiftCost.ts), and the count only
 * goes back to 0 with a Path reset (aaap-tools game-mechanics.md §7). Stepped exactly from 0 shifts, what is left is
 * 97% after 60, 69% after 120, 24% after 168, 6% after 200 and 0.2% after 240, for any soul eggs from 1e15 to 1e24
 * (the review's numbers; soulEggs.spec.ts holds them). That is the formula itself, not a curve fitted to it, so no
 * interpolation: `soulEggsLeft` pays each shift out of what is left, as `plannedShiftsCost` does, earning none.
 *
 * Under a quarter left, one plain amber line says so (SoulEggWarning.vue); it never blocks anything.
 */
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
