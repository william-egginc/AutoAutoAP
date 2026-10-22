/**
 * The Egg Day rule at every pick (lib/eggDayRule.ts, Jordan 22 Oct 2026): Right now's plan (`pickGoalPlan`,
 * `plansByGoal`), the Egg Day tile (`buildTile`), a snapshot whose Check exactly found no route in time
 * (`planFromSnapshot`), the boards (`madeDeadline`). A route that lands after Egg Day starts (or after a By a date
 * date) is never picked, however much TE it reaches; with nothing in time the nearest is only said.
 */
import { describe, expect, it } from 'vitest';
import { pickCardPlan, pickGoalPlan, planInTime, currentSetup, type CardCandidate } from './currentAnswer';
import { goalDefs, goalOptions, plansByGoal, emptyGoalWords } from './planGoals';
import { planFromSnapshot, type NowPlan, type SnapLike } from './nowPlan';
import { buildTile, type TileInput } from './savedTiles';
import { madeDeadline, type BoardRow } from './leaderboardRank';
import { eggDaySeconds } from './eggDay';

const H = 3600;
const START = eggDaySeconds(2027);
const MAR3 = Date.UTC(2027, 2, 3, 7) / 1000;
const NOW = Date.UTC(2026, 9, 15, 22, 0);
const SAVE = NOW / 1000 - 3 * H;
const EGG_DAY = { year: 2027, at: START };
const SETUP = { availability: null, timeOff: [] };

const plan = (o: Partial<NowPlan> & { end: number; endTE: number }, deadline = START): NowPlan => ({
  goal: 'date',
  deadline,
  chain: [161, 198, 218, o.endTE],
  legs: null,
  tableLegs: null,
  exact: true,
  instantTE: o.endTE,
  calculatedAt: NOW - 2 * H * 1000,
  planStart: SAVE,
  spareHours: (deadline - o.end) / H,
  runnerUpHours: null,
  meta: { account: 'acct', goal: `date ${deadline}`, backupTime: SAVE },
  whatIf: null,
  ...o,
});
const cand = (p: NowPlan, goalKey = 'eggday-2027', goalIndex = 1): CardCandidate => ({
  plan: p,
  goalIndex,
  goalKey,
  ownKey: true,
  check: currentSetup(SETUP),
});

describe('Right now’s plan: only a plan in time is the pick', () => {
  const early = plan({ end: START - 20 * H, endTE: 247 });
  const atStart = plan({ end: START, endTE: 248 });
  const late = plan({ end: START + 7 * H, endTE: 249, calculatedAt: NOW });

  it('a late plan reaching more TE never beats one in time', () => {
    expect(pickGoalPlan([cand(late), cand(early)], SAVE)?.candidate.plan).toBe(early);
    expect(planInTime(late)).toBe(false);
    expect(planInTime(early)).toBe(true);
  });

  it('exactly at the start counts', () => {
    expect(pickGoalPlan([cand(late), cand(early), cand(atStart)], SAVE)?.candidate.plan).toBe(atStart);
  });

  it('every plan late: no pick at all', () => {
    expect(pickGoalPlan([cand(late)], SAVE)).toBeNull();
    expect(pickCardPlan([cand(late)], SAVE)).toBeNull();
  });

  it('pickCardPlan over goals: the goal with a late plan only is skipped', () => {
    const race: NowPlan = { ...plan({ end: START + 400 * 86400, endTE: 490 }), goal: 'fastest', deadline: null, spareHours: null, calculatedAt: NOW - 5 * H * 1000 };
    expect(pickCardPlan([cand(late), cand(race, 'fastest-490', 0)], SAVE)?.candidate.plan).toBe(race);
  });

  it('the player’s own followed route is still priced late (`anyTime`): the card marks it', () => {
    expect(pickGoalPlan([cand(late)], SAVE, { anyTime: true })?.candidate.plan).toBe(late);
  });

  it('plansByGoal: a goal with late plans only says how late the nearest is; the switch shows it as "late"', () => {
    const later = plan({ end: START + 30 * H, endTE: 250 });
    const goals = goalDefs({ ownTarget: 490, raceTarget: 490, eggDay: EGG_DAY, otherDates: [], dayWords: () => '' });
    const list = plansByGoal(goals, [cand(later), cand(late)], [], SAVE);
    const egg = list.find(p => p.goal.key === 'eggday-2027')!;
    expect(egg.pick).toBeNull();
    expect(egg.late).toEqual({ count: 2, chain: late.chain, seconds: 7 * H });
    const opt = goalOptions(list, 'America/Denver').find(o => o.key === 'eggday-2027')!;
    expect(opt.state).toBe('late');
    expect(opt.late?.seconds).toBe(7 * H);
    expect(emptyGoalWords('late')).toBe('no saved plan in time for this goal');
    // Mixed: the plan in time is picked, nothing said about the late one.
    const mixed = plansByGoal(goals, [cand(late), cand(early)], [], SAVE).find(p => p.goal.key === 'eggday-2027')!;
    expect(mixed.pick?.candidate.plan).toBe(early);
    expect(mixed.late).toBeUndefined();
  });

  it('By a date: the same against the player’s date', () => {
    const goals = goalDefs({ ownTarget: 490, raceTarget: 490, eggDay: EGG_DAY, otherDates: [MAR3], dayWords: () => 'Mar 3, 2027' });
    const before = plan({ end: MAR3 - H, endTE: 230 }, MAR3);
    const after = plan({ end: MAR3 + 3 * H, endTE: 232 }, MAR3);
    const key = `date-${MAR3}`;
    const mixed = plansByGoal(goals, [cand(after, key, 2), cand(before, key, 2)], [], SAVE).find(p => p.goal.key === key)!;
    expect(mixed.pick?.candidate.plan).toBe(before);
    const lateOnly = plansByGoal(goals, [cand(after, key, 2)], [], SAVE).find(p => p.goal.key === key)!;
    expect(lateOnly.pick).toBeNull();
    expect(lateOnly.late?.seconds).toBe(3 * H);
  });
});

describe('a snapshot whose Check exactly found no route in time', () => {
  const route = (endTE: number, end: number) => ({ chain: [200, endTE], legs: [{ to: endTE, endTE, start: 0, end }], end });
  const snap = (o: Partial<SnapLike>): SnapLike => ({
    at: NOW,
    result: { best: null, byAscensions: [], byDate: route(248, START - 5 * H), byDateByAscensions: [] },
    ...o,
  });

  it('the table’s route is late on the account at its exact price: never the pick', () => {
    const p = planFromSnapshot(
      snap({ exact: { '200,248': { end: START + 9 * H, endTE: 248 } }, dateExact: null, dateExactByK: { 2: null } }),
      'date',
      START
    )!;
    expect(p.exact).toBe(false);
    expect(p.accountEnd).toBe(START + 9 * H);
    expect(planInTime(p)).toBe(false);
    expect(pickGoalPlan([cand(p)], SAVE)).toBeNull();
  });

  it('untimed there: late all the same (Infinity)', () => {
    const p = planFromSnapshot(snap({ exact: {}, dateExact: null, dateExactByK: { 2: null, 3: null } }), 'date', START)!;
    expect(p.accountEnd).toBe(Infinity);
    expect(planInTime(p)).toBe(false);
  });

  it('before any Check exactly (no rows): the table’s route stands, in time', () => {
    const p = planFromSnapshot(snap({}), 'date', START)!;
    expect(p.accountEnd).toBeUndefined();
    expect(planInTime(p)).toBe(true);
  });
});

describe('the Egg Day tile: only an answer in time heads it', () => {
  const row = (o: Partial<BoardRow>): BoardRow => ({
    id: 'r',
    chain: [161, 198, 218, 249],
    finalTE: 249,
    durationDays: 270,
    timezone: 'UTC',
    deadline: START,
    deadlineAscendAt: START + 7 * H,
    submittedAt: new Date(NOW - H * 1000).toISOString(),
    startUtc: new Date(SAVE * 1000 + H * 1000).toISOString(),
    backupAgeHours: 1,
    backupTE: 186,
    level: 'quick',
    yours: true,
    ...o,
  });
  const base = (o: Partial<TileInput>): TileInput => ({
    goal: 'date',
    target: 490,
    deadline: START,
    nowMs: NOW,
    save: { seconds: SAVE, te: 186 },
    snapshot: null,
    lastChecked: null,
    history: [],
    board: null,
    saved: [],
    ...o,
  });

  it('mixed: a board run after the start reaching 249 never beats a snapshot in time at 247', () => {
    const t = buildTile(base({ snapshot: plan({ end: START - 20 * H, endTE: 247 }), board: [row({})] }));
    expect(t.answer?.endTE).toBe(247);
    expect(t.answer?.source).toBe('snapshot');
    expect(t.late).toBeUndefined();
  });

  it('exactly at the start counts', () => {
    const t = buildTile(base({ board: [row({ deadlineAscendAt: START })] }));
    expect(t.answer?.endTE).toBe(249);
  });

  it('no answer in time: none is the answer; the nearest late one is kept with how late', () => {
    const t = buildTile(base({ board: [row({}), row({ id: 'r2', deadlineAscendAt: START + 30 * H, finalTE: 250, chain: [161, 250] })] }));
    expect(t.answer).toBeNull();
    expect(t.sure).toBeNull();
    expect(t.late?.count).toBe(2);
    expect(t.late?.seconds).toBe(7 * H);
    expect(t.late?.answer?.endTE).toBe(249);
  });

  it('a Check exactly entry that found no route in time (exact null) is late, untimed', () => {
    const t = buildTile(
      base({
        history: [
          {
            at: NOW - 600_000,
            backupTime: SAVE,
            te: 186,
            mode: 'date',
            deadline: START,
            instant: { chain: [200, 248], end: START - 2 * H, endTE: 248 },
            exact: null,
            shared: false,
            sig: 's',
          },
        ],
      })
    );
    expect(t.answer).toBeNull();
    expect(t.late).toEqual({ answer: null, seconds: null, count: 1 });
  });

  it('a late snapshot (no route in time on the account) is not the tile', () => {
    const late = { ...plan({ end: START - 5 * H, endTE: 248, exact: false }), accountEnd: START + 2 * H };
    const t = buildTile(base({ snapshot: late }));
    expect(t.answer).toBeNull();
    expect(t.late?.seconds).toBe(2 * H);
  });

  it('a saved By a date answer: its last ascension (deadline less spare) against the start', () => {
    const saved = (spare: number, te: number) => ({
      savedAt: NOW - 1000,
      deadline: START,
      te: 186,
      saveSeconds: SAVE,
      level: 'quick',
      route: { chain: [200, te], reachAt: START - spare - 600, spare },
    });
    expect(buildTile(base({ saved: [saved(-3 * H, 250), saved(4 * H, 247)] })).answer?.endTE).toBe(247);
    expect(buildTile(base({ saved: [saved(-3 * H, 250)] })).late?.seconds).toBe(3 * H);
  });

  it('By a date: the same against the player’s date', () => {
    const t = buildTile(
      base({
        deadline: MAR3,
        board: [row({ deadline: MAR3, deadlineAscendAt: MAR3 + 2 * H }), row({ id: 'r2', deadline: MAR3, deadlineAscendAt: MAR3 - H, finalTE: 230, chain: [161, 230] })],
      })
    );
    expect(t.answer?.endTE).toBe(230);
    const only = buildTile(base({ deadline: MAR3, board: [row({ deadline: MAR3, deadlineAscendAt: MAR3 + 2 * H })] }));
    expect(only.answer).toBeNull();
    expect(only.late?.seconds).toBe(2 * H);
  });

  it('Fastest is untouched by the rule', () => {
    const t = buildTile(
      base({
        goal: 'fastest',
        deadline: null,
        lastChecked: { at: NOW - H * 1000, chain: [165, 200, 490], end: START + 400 * 86400, endTE: 490 },
      })
    );
    expect(t.answer?.endTE).toBe(490);
    expect(t.late).toBeUndefined();
  });
});

describe('the boards: madeDeadline is the same rule', () => {
  const r = (at: number, deadline = START) => ({ chain: [249], finalTE: 249, deadline, deadlineAscendAt: at }) as unknown as BoardRow;
  it('before, at, after', () => {
    expect(madeDeadline(r(START - 1))).toBe(true);
    expect(madeDeadline(r(START))).toBe(true);
    expect(madeDeadline(r(START + 1))).toBe(false);
    expect(madeDeadline(r(MAR3 + 1, MAR3))).toBe(false);
  });
});
