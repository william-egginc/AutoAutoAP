/**
 * Right now when the save is not on virtue yet (16 Oct 2026; lib/onVirtue.ts, the same test "When should I start?"
 * uses): nothing to do on a farm, so no Next step and no calendar; the future plan is shown as exploration, from
 * what each goal has SAVED (its kept plan's fresh-start instant, `NowPlan.planStart`, and its finish). Nothing is
 * worked out here: a goal with nothing saved says so, and "When should I start?" prices a start at every hour.
 * Pure.
 */
import { dateAt } from './eventWhen';
import type { NowPlan } from './nowPlan';

export interface StartGoal {
  key: string;
  /** "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
  name: string;
  goal: 'fastest' | 'date';
  target: number;
  /** The goal's saved plan; null when none is kept. */
  plan: NowPlan | null;
}

export interface StartLine {
  key: string;
  text: string;
}

/** Said when no goal has a saved plan. */
export const NOTHING_PRICED = 'No start time is priced yet for this save.';

/**
 * One line per goal: "If you start Oct 30 at 6:00 pm: 490 on Nov 20 at 3:00 am (Race to 490, Check exactly)",
 * "If you start Oct 30 at 6:00 pm: Egg Day 2027 TE 313 (instant answer)", "Egg Day 2027: no start time is priced
 * yet". Empty when no goal has a plan (say `NOTHING_PRICED` instead).
 */
export function startLines(goals: readonly StartGoal[], nowSeconds: number, zone: string): StartLine[] {
  if (!goals.some(g => g.plan)) return [];
  return goals.map(g => {
    const p = g.plan;
    if (!p) return { key: g.key, text: `${g.name}: no start time is priced yet` };
    const how = p.exact ? 'Check exactly' : 'instant answer';
    const start = p.planStart ? `If you start ${dateAt(p.planStart, nowSeconds, zone)}: ` : '';
    const what =
      g.goal === 'date'
        ? `${g.name} TE ${Math.floor(p.endTE)} (${how})`
        : `${g.target} on ${dateAt(p.end, nowSeconds, zone)} (${g.name}, ${how})`;
    return { key: g.key, text: `${start}${what}` };
  });
}
