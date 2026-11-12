/**
 * YOUR EGGS' PER-EGG "TO GOAL" TIMES, ROUNDED LIKE THE FULL TIMELINE (QA on 9a994dfcf, 12 Nov 2026): with a Fastest goal,
 * each egg's "to goal about Wed, Feb 21, 2029 at 5:28 AM" kept its minutes while the Full timeline rounds the same far-off
 * estimates of a plan that isn't exact to the hour ("about Mar 5, 2027, 9:00 PM"). The header line was rounded in
 * spec-myruns-fix (eggGoal.rounded.spec.ts); these per-egg lines now use the same helper (lib/nowWords.ts `roundToHourIn`)
 * and the same flag (`rounded`: the plan isn't exact). An exact plan keeps its minutes.
 */
import { describe, expect, it } from 'vitest';
import { eggClockLines } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';

// 47 minutes past an hour, so a time the rates give lands off the hour unless rounded.
const NOW = Math.floor(1_800_000_000 / 3600) * 3600 + 47 * 60;
const ZONE = 'America/Los_Angeles';
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const rates = { maxHabs: 1e10, perChicken: 200, maxElr: 2e12, ihr: 1e4 };
const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);

function goal(rounded?: boolean): Record<string, string> {
  return eggClockLines({
    eggs,
    delivered,
    totalTe: 150,
    rates,
    teLeft: 40,
    now: NOW,
    saveSeconds: NOW,
    zone: ZONE,
    shifts: [],
    ...(rounded === undefined ? {} : { rounded }),
  }).goal;
}

const minutes = (s: string) => s.match(/at (\d{1,2}):(\d{2}) [AP]M/)?.[2];

describe('eggClockLines, a Fastest goal: each egg\'s "to goal" time to the hour when the plan is not exact', () => {
  it('rounded: every egg\'s time is on the hour, still "about", in the "9:00 AM" style', () => {
    const lines = Object.values(goal(true));
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(l).toMatch(/^to goal about /);
      expect(minutes(l)).toBe('00');
    }
  });
  it('an exact plan keeps the minutes (some egg lands off the hour)', () => {
    const exact = [...Object.values(goal(false)), ...Object.values(goal())];
    expect(exact.some(l => minutes(l) !== '00')).toBe(true);
  });
});
