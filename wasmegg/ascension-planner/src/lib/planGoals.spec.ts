/**
 * The "which plan" switch's pure part (Jordan, 16 Oct 2026): per goal its saved plan by lib/currentAnswer.ts's rule,
 * the default goal (the one checked last), the goal keys and the screens "Work it out ›" opens.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultGoalKey,
  emptyGoalWords,
  goalDefs,
  goalKeyOf,
  goalOpen,
  goalOptions,
  nextGoalIndex,
  plansByGoal,
  type GoalAnswer,
  type PlanGoal,
} from './planGoals';
import { currentSetup, setupCheck, todayIn, type CardCandidate, type PricedSetup } from './currentAnswer';
import type { NowPlan } from './nowPlan';

const ZONE = 'America/Denver';
const SAVE = Date.UTC(2026, 9, 15, 20, 40) / 1000;
const NOW_MS = Date.UTC(2026, 9, 16, 20, 0);
const TODAY = todayIn(NOW_MS, ZONE);
const EGG_DAY = { year: 2027, at: Date.UTC(2027, 6, 14, 16) / 1000 };
const MAR3 = Date.UTC(2027, 2, 3, 7) / 1000;
const MINE: PricedSetup = { availability: { days: [], fromHour: 7, toHour: 1, timezone: ZONE }, timeOff: [] };
const ANY: PricedSetup = { availability: null, timeOff: [] };
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 16, 5, 0);

const plan = (goal: 'fastest' | 'date', at: number, chain: number[], o: Partial<NowPlan> = {}): NowPlan => ({
  goal,
  deadline: goal === 'date' ? EGG_DAY.at : null,
  chain,
  // By a date: 10 h before Egg Day starts (a plan after it is never the pick, lib/eggDayRule.ts).
  end: goal === 'date' ? EGG_DAY.at - 10 * 3600 : Date.UTC(2028, 8, 22) / 1000,
  endTE: chain[chain.length - 1],
  legs: null,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: at,
  planStart: SAVE,
  spareHours: goal === 'date' ? 10 : null,
  runnerUpHours: null,
  meta: { account: 'acct', goal: goal === 'date' ? `date ${EGG_DAY.at}` : 'target 490', backupTime: SAVE },
  whatIf: null,
  ...o,
});

const goals = goalDefs({ ownTarget: 490, raceTarget: 490, eggDay: EGG_DAY, otherDates: [MAR3], dayWords: () => 'Mar 3, 2027' });
const own = (p: NowPlan, goalKey: string, goalIndex = 0): CardCandidate => ({ plan: p, goalIndex, goalKey, ownKey: true, check: currentSetup(MINE) });
const other = (p: NowPlan, goalKey: string, recorded: PricedSetup | null, goalIndex = 0): CardCandidate => ({
  plan: p,
  goalIndex,
  goalKey,
  ownKey: false,
  check: setupCheck(recorded, MINE, TODAY),
});

describe('goal keys and the goal list', () => {
  it('each By a date goal a pill of its own, named by its date; a custom race by its target (24 Oct 2026)', () => {
    const FEB10 = MAR3 - 21 * 86400;
    const list = goalDefs({
      ownTarget: 490,
      raceTarget: 490,
      eggDay: EGG_DAY,
      otherDates: [MAR3, FEB10, MAR3],
      otherTargets: [312],
      dayWords: t => (t === FEB10 ? 'Feb 10, 2027' : 'Mar 3, 2027'),
    });
    expect(list.map(g => [g.key, g.label])).toEqual([
      ['fastest-490', 'Fastest to 490 TE'],
      ['fastest-312', 'Fastest to 312 TE'],
      ['eggday-2027', 'Egg Day 2027'],
      [`date-${FEB10}`, 'By Feb 10, 2027'],
      [`date-${MAR3}`, 'By Mar 3, 2027'],
    ]);
  });

  it('fastest-<target>, eggday-<year>, date-<unix>', () => {
    expect(goalKeyOf('fastest', 490, null, EGG_DAY)).toBe('fastest-490');
    expect(goalKeyOf('date', 490, EGG_DAY.at, EGG_DAY)).toBe('eggday-2027');
    expect(goalKeyOf('date', 490, MAR3, EGG_DAY)).toBe(`date-${MAR3}`);
  });

  it('Race to your own target first; Fastest to 490 beside it only when the target differs; other dates optional', () => {
    expect(goals.map(g => [g.key, g.label, g.name, !!g.optional])).toEqual([
      ['fastest-490', 'Fastest to 490 TE', 'Fastest to 490 TE', false],
      ['eggday-2027', 'Egg Day 2027', 'Egg Day 2027', false],
      [`date-${MAR3}`, 'By Mar 3, 2027', 'By Mar 3, 2027', true],
    ]);
    const mine = goalDefs({ ownTarget: 450, raceTarget: 490, eggDay: EGG_DAY, otherDates: [EGG_DAY.at], dayWords: String });
    expect(mine.map(g => [g.key, g.label, !!g.optional])).toEqual([
      ['fastest-450', 'Fastest to 450 TE', false],
      ['fastest-490', 'Fastest to 490 TE', true],
      ['eggday-2027', 'Egg Day 2027', false],
    ]);
  });
});

describe('plansByGoal', () => {
  const race = plan('fastest', T0, [197, 240, 300, 490]);

  it('each goal its plan; a goal with nothing listed empty; By a date only when a plan of it is kept', () => {
    const list = plansByGoal(goals, [own(race, 'fastest-490')], [], SAVE);
    expect(list.map(p => [p.goal.key, !!p.pick, p.answerOnly])).toEqual([
      ['fastest-490', true, false],
      ['eggday-2027', false, false],
    ]);
    expect(list[0].pick?.candidate.plan).toBe(race);
    const withDate = plansByGoal(goals, [own(race, 'fastest-490'), other(plan('date', T0, [200, 230], { deadline: MAR3 }), `date-${MAR3}`, MINE)], [], SAVE);
    expect(withDate.map(p => p.goal.key)).toEqual(['fastest-490', 'eggday-2027', `date-${MAR3}`]);
  });

  it('an instant answer only (no timeline): listed as "no saved plan with its times"', () => {
    const answers: GoalAnswer[] = [{ goalKey: 'eggday-2027', calculatedAt: T0 + 90 * MIN, saveSeconds: SAVE, ownKey: true }];
    const list = plansByGoal(goals, [own(race, 'fastest-490')], answers, SAVE);
    const egg = list.find(p => p.goal.key === 'eggday-2027')!;
    expect(egg.pick).toBeNull();
    expect(egg.answerOnly).toBe(true);
    expect(emptyGoalWords('answer-only')).toBe('no saved plan with its times for this goal yet');
    expect(emptyGoalWords('none')).toBe('no saved plan for this goal yet');
  });

  it("within a goal, currentAnswer's rule: the current setup leads a sooner plan priced with other hours (secondary)", () => {
    const sooner = plan('fastest', T0 + 5 * MIN, [160, 197, 240, 300, 490], { end: race.end - 86400 * 5 });
    const list = plansByGoal(goals, [own(race, 'fastest-490'), other(sooner, 'fastest-490', ANY)], [], SAVE);
    expect(list[0].pick?.candidate.plan).toBe(race);
    expect(list[0].pick?.state).toBe('this-save');
    expect(list[0].pick?.secondary?.plan).toBe(sooner);
    // An older save's plan never leads one of the loaded save.
    const old = plan('fastest', T0 + 60 * MIN, [490], { meta: { account: 'acct', goal: 'target 490', backupTime: SAVE - 3 * 86400 } });
    expect(plansByGoal(goals, [other(old, 'fastest-490', MINE), own(race, 'fastest-490')], [], SAVE)[0].pick?.candidate.plan).toBe(race);
  });
});

describe('the default goal: the one checked LAST', () => {
  const race = plan('fastest', T0, [197, 240, 300, 490]);
  const eggDay = plan('date', T0 + 30 * MIN, [197, 222, 247, 285, 313]);

  it('the newest plan wins, whatever the goal (no more Fastest > own target > Egg Day)', () => {
    const list = plansByGoal(goals, [own(race, 'fastest-490'), own(eggDay, 'eggday-2027', 2)], [], SAVE);
    expect(defaultGoalKey(list, SAVE)).toBe('eggday-2027');
    const later = { ...race, calculatedAt: T0 + 60 * MIN };
    expect(defaultGoalKey(plansByGoal(goals, [own(later, 'fastest-490'), own(eggDay, 'eggday-2027', 2)], [], SAVE), SAVE)).toBe('fastest-490');
  });

  it('a later instant answer of the loaded save counts as checking that goal', () => {
    const answers: GoalAnswer[] = [{ goalKey: 'fastest-490', calculatedAt: T0 + 2 * 60 * MIN, saveSeconds: SAVE }];
    const list = plansByGoal(goals, [own(race, 'fastest-490'), own(eggDay, 'eggday-2027', 2)], answers, SAVE);
    expect(defaultGoalKey(list, SAVE)).toBe('fastest-490');
    // An answer of an older save does not.
    const old: GoalAnswer[] = [{ goalKey: 'fastest-490', calculatedAt: T0 + 2 * 60 * MIN, saveSeconds: SAVE - 3 * 86400 }];
    expect(defaultGoalKey(plansByGoal(goals, [own(race, 'fastest-490'), own(eggDay, 'eggday-2027', 2)], old, SAVE), SAVE)).toBe('eggday-2027');
  });

  it("currentAnswer's tiers come first: the current save and setup before the newest", () => {
    // Egg Day's newer plan is of other hours; Race's is priced with the hours now: Race.
    const list = plansByGoal(goals, [own(race, 'fastest-490'), other(eggDay, 'eggday-2027', ANY, 2)], [], SAVE);
    expect(defaultGoalKey(list, SAVE)).toBe('fastest-490');
    // A goal with a plan before a goal checked later without one.
    const answers: GoalAnswer[] = [{ goalKey: 'eggday-2027', calculatedAt: T0 + 5 * 60 * MIN, saveSeconds: SAVE, ownKey: true }];
    expect(defaultGoalKey(plansByGoal(goals, [own(race, 'fastest-490')], answers, SAVE), SAVE)).toBe('fastest-490');
  });

  it('nothing kept: the goal last checked at all, else Race', () => {
    expect(defaultGoalKey(plansByGoal(goals, [], [], SAVE), SAVE)).toBe('fastest-490');
    const answers: GoalAnswer[] = [{ goalKey: 'eggday-2027', calculatedAt: T0, saveSeconds: SAVE }];
    expect(defaultGoalKey(plansByGoal(goals, [], answers, SAVE), SAVE)).toBe('eggday-2027');
    expect(defaultGoalKey([], SAVE)).toBeNull();
  });
});

describe('the options and "Work it out ›"', () => {
  it("each goal's own screen: Fastest with its target, By a date for Egg Day or the date", () => {
    const g = (key: string) => goals.find(x => x.key === key)! as PlanGoal;
    expect(goalOpen(g('fastest-490'), ZONE)).toEqual({ auto: 'fastest', depth: 'smart', target: 490 });
    expect(goalOpen({ kind: 'race', target: 450, deadline: null }, ZONE)).toEqual({ auto: 'fastest', depth: 'smart', target: 450 });
    expect(goalOpen(g('eggday-2027'), ZONE)).toEqual({ auto: 'by-date', byDate: { eggDay: true } });
    expect(goalOpen(g(`date-${MAR3}`), ZONE)).toEqual({ auto: 'by-date', byDate: { deadline: MAR3, zone: ZONE } });
  });

  it('options carry the state and the screen', () => {
    const race = plan('fastest', T0, [490]);
    const opts = goalOptions(plansByGoal(goals, [own(race, 'fastest-490')], [{ goalKey: 'eggday-2027', calculatedAt: T0, saveSeconds: SAVE }], SAVE), ZONE);
    expect(opts.map(o => [o.key, o.state, o.calculatedAt])).toEqual([
      ['fastest-490', 'plan', T0],
      ['eggday-2027', 'answer-only', null],
    ]);
    expect(opts[1].open).toEqual({ auto: 'by-date', byDate: { eggDay: true } });
  });

  it('arrow keys wrap; Home and End; other keys do nothing', () => {
    expect(nextGoalIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextGoalIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextGoalIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextGoalIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextGoalIndex('Home', 2, 3)).toBe(0);
    expect(nextGoalIndex('End', 0, 3)).toBe(2);
    expect(nextGoalIndex('Enter', 0, 3)).toBeNull();
  });
});
