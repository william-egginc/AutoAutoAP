/**
 * YOUR EGGS' GOAL LINE, ROUNDED LIKE RIGHT NOW (spec-myruns-fix, 12 Nov 2026): Jordan's Egg Day 2027 route followed on
 * the instant answer's data said "to goal: 313 TE Jul 17, 2027 at 2:51 AM" on Your eggs while Right now's timeline and
 * events table said "at around 3:00 AM" for the same finish. The same moment (lib/currentAnswer.ts `planFinish`); the
 * table rounds an instant answer's (or an estimate's) times to the hour (lib/nowWords.ts `roundedAt`, wireframe R1),
 * Your eggs did not. A plan that isn't exact now shows the same hour there; an exact plan keeps its minutes.
 */
import { describe, expect, it } from 'vitest';
import { eggGoalLines } from './nextTeEgg';
import { eggLines } from './farmFacts';
import { getThresholdForTE } from './truthEggs';
import { whenWords } from './nowWords';

const NOW = 1_800_000_000;
const ZONE = 'America/Los_Angeles';
const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const eggs = eggLines(delivered, {}, 'curiosity', 1e12, null);
// 247 days on, 51 minutes past an hour on the planner's clock (an hour boundary in Los Angeles is one in UTC too).
const FINISH = Math.floor((NOW + 247 * 86400) / 3600) * 3600 + 51 * 60;

function line(rounded?: boolean): string {
  return eggGoalLines({
    eggs,
    goal: { endTE: 313, finish: FINISH, zone: ZONE, ...(rounded === undefined ? {} : { rounded }) },
    now: NOW,
  }).kindness;
}

describe('eggGoalLines, a By a date goal: the hour Right now shows', () => {
  it("an instant answer's or estimated plan: rounded to the hour, the same hour as the events table", () => {
    const table = whenWords({ at: FINISH, kind: 'prestige' }, 'date', NOW, ZONE, true); // "… at around 3:00 AM"
    const hour = table.match(/at around (\d{1,2}:\d{2}\s?[AP]M)/i)?.[1];
    expect(hour).toMatch(/:00/);
    expect(line(true)).toContain(`at ${hour}`);
    expect(line(true)).not.toMatch(/:51/);
  });
  it('an exact plan (a search on the account) keeps its minutes', () => {
    expect(line(false)).toMatch(/:51/);
    expect(line()).toMatch(/:51/);
  });
});
