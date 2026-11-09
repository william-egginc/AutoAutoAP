/**
 * The soul-egg (Path reset) warning in two parts (Jordan, 9 Nov 2026: the one long amber line nagged a tester): ONE short
 * line on the page and the details behind a "?" fold. Wording only (a *Words.ts file is out of the result code hash,
 * lib/resultCodeHash.ts `isWordingOnly`). The numbers come from lib/soulEggs.ts `soulEggWarningParts`; UI places the "?".
 */

/** The share left, said: "under 1%" or "about 12%" (rounded down, so a warning under 25% never says "about 25%"). */
export function soulEggPercentWords(left: number): string {
  return left < 0.01 ? 'under 1%' : `about ${Math.floor(left * 100)}%`;
}

const s = (n: number) => (n === 1 ? '' : 's');

/** The one line on the page. `alone`: the save's shifts since its last Path reset aren't known, so only this plan counts. */
export function soulEggLine(percent: string, alone: boolean): string {
  return alone ? `This plan alone would leave ${percent} of your soul eggs.` : `This plan would leave ${percent} of your soul eggs.`;
}

/** The "?" tip's name for screen readers. */
export const SOUL_EGG_TIP_LABEL = 'Where this comes from';

/** The details behind the "?". `done`: the save's shifts since its last Path reset, or null when not known. */
export function soulEggFold(o: { plan: number; done: number | null; percent: string; quarterShifts: number }): string {
  const tail = `Past about ${o.quarterShifts} shifts since a Path reset, less than a quarter is left.`;
  if (o.done == null)
    return `This plan has ${o.plan} shift${s(o.plan)}, counted from 0 shifts: your save's shifts since your last Path reset aren't known here. ${tail}`;
  return `About ${o.done + o.plan} shifts since your last Path reset (${o.done} in your save, ${o.plan} in the plan) would leave ${o.percent} of the soul eggs you have now. ${tail}`;
}
