import { describe, expect, it } from 'vitest';
import {
  SIM_STAMPED_FROM_MS,
  STALE_AFTER_MS,
  bestPerGoal,
  buildCards,
  buildSteps,
  dashLines,
  goalAhead,
  goalKey,
  hoursDiffer,
  openFor,
  rerunAction,
  simulatorAge,
  type DashInput,
} from './myRunsDashboard';
import { eggDaySeconds } from './eggDay';
import { SIM_VERSION } from '@/search/simVersion';
import { describeAvailability, type Availability } from '@/search/availabilitySchedule';
import type { BoardRow } from './leaderboardRank';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 19, 0); // 15 Oct 2026, 12 pm Pacific
const ZONE = 'America/Los_Angeles';
const EGG = eggDaySeconds(2027);
const NOV1 = Date.UTC(2026, 10, 1, 16) / 1000;
const HOURS: Availability = { days: [], fromHour: 9, toHour: 1, timezone: ZONE };

let n = 0;
function race(over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `r${++n}`,
    chain: [200, 300, 400, 490],
    durationDays: 100,
    startUtc: '2026-10-14T16:00:00Z',
    timezone: ZONE,
    finalTE: 490,
    currentTE: 180,
    backupTE: 180,
    window: describeAvailability(HOURS),
    effort: 'normal',
    simVersion: SIM_VERSION,
    receivedAt: new Date(NOW - DAY).toISOString(),
    yours: true,
    ...over,
  };
}
function date(deadline: number, over: Partial<BoardRow> = {}): BoardRow {
  return race({
    chain: [200, 240, 251],
    finalTE: 251,
    deadline,
    deadlineAscendAt: deadline - 2 * 86400,
    effort: 'deadline',
    mode: 'advanced',
    ...over,
  } as Partial<BoardRow>);
}
function input(rows: BoardRow[] | null, over: Partial<DashInput> = {}): DashInput {
  return {
    rows,
    now: NOW,
    eggDayAt: EGG,
    eggDayYear: 2027,
    zone: ZONE,
    teNow: 180,
    setup: { availability: HOURS, timeOff: [], rememberedAt: NOW - DAY },
    local: { answers: [], runs: [], pending: [] },
    ...over,
  };
}
const ids = (i: DashInput) => buildSteps(i).steps.map(s => s.id);
const kinds = (i: DashInput) => buildSteps(i).steps.flatMap(s => s.kinds);

describe('goals and the best run per goal', () => {
  it('keys a race by its target and a date by its moment', () => {
    expect(goalKey(race())).toBe('race:490');
    expect(goalKey(date(EGG))).toBe(`date:${EGG}`);
  });
  it('folds copies of one result and marks look-alikes and hidden runs', () => {
    const a = race({ id: 'a' });
    const lines = dashLines([
      a,
      { ...a, id: 'b' },
      race({ id: 'c', chain: [250, 490], yours: false }),
      race({ id: 'd', chain: [300, 490], hidden: true }),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines.find(l => l.row.chain.length === 2 && l.row.chain[0] === 250)?.maybe).toBe(true);
    expect(lines.find(l => l.row.chain[0] === 300)?.hidden).toBe(true);
  });
  it('the best per goal: the earliest finish for a race, the highest TE for a date', () => {
    const slow = race({ durationDays: 120 });
    const fast = race({ durationDays: 90, chain: [210, 490] });
    const low = date(EGG, { finalTE: 240, chain: [240] });
    const high = date(EGG);
    const best = bestPerGoal(dashLines([slow, fast, low, high]), EGG);
    expect(best.get('race:490')?.row).toBe(fast);
    expect(best.get(`date:${EGG}`)?.row).toBe(high);
  });
  it('a goal is ahead until its date passes or the save reaches its target', () => {
    expect(goalAhead(date(NOV1), NOW, 180)).toBe(true);
    expect(goalAhead(date(NOW / 1000 - 60), NOW, 180)).toBe(false);
    expect(goalAhead(race(), NOW, 489)).toBe(true);
    expect(goalAhead(race(), NOW, 490)).toBe(false);
    expect(goalAhead(race(), NOW, 0)).toBe(true);
  });
});

describe('the cards', () => {
  it('Egg Day, race, date, saved, last run and hours, in that order', () => {
    const cards = buildCards(input([race(), date(EGG), date(NOV1, { finalTE: 247, chain: [200, 247] })]));
    expect(cards.map(c => c.id)).toEqual(['eggday', 'race', 'date', 'saved', 'last', 'hours']);
    const [egg, r, d, saved, last, hours] = cards;
    expect(egg.title).toBe('Egg Day 2027');
    expect(egg.main).toBe('251 TE');
    expect(egg.lines).toEqual(['48.0 h spare', '200 240 251', 'sent Oct 14']);
    expect(r.main).toBe('Jan 22, 2027');
    expect(r.lines[0]).toBe('4 ascensions');
    expect(d.title).toBe('By Nov 1');
    expect(d.main).toBe('247 TE');
    expect(saved.main).toBe('0 answers, 0 runs');
    expect(last.main).toBe('Oct 14');
    expect(last.lines).toEqual(['12:00 pm', 'sent']);
    expect(hours.main).toBe('9 am to 1 am');
    expect(hours.lines).toEqual(['no time off', 'remembered Oct 14']);
  });
  it('Egg Day falls back to a saved answer, then to an empty card with the Egg Day action', () => {
    const saved = buildCards(
      input([], {
        local: {
          answers: [{ savedAt: NOW, deadline: EGG, chain: [200, 248], spare: 3600 * 5 }],
          runs: [],
          pending: [],
        },
      })
    )[0];
    expect(saved.main).toBe('248 TE');
    expect(saved.lines).toEqual(['5.0 h spare', '200 248', 'saved, not sent']);
    const none = buildCards(input([]))[0];
    expect(none.empty).toBe(true);
    expect(none.action?.to).toEqual({ to: 'by-date', deadline: EGG, eggDay: true, tab: 'nearby' });
    expect(buildCards(input(null))[0].main).toBe('Loading…');
  });
  it('a card from a look-alike run says so', () => {
    const cards = buildCards(input([race({ yours: false })]));
    expect(cards[1].maybe).toBe(true);
    expect(cards[0].maybe).toBeUndefined();
  });
  it('the other date card shows the soonest date still ahead, not a passed one', () => {
    const passed = date(NOW / 1000 - 86400, { finalTE: 300, chain: [300] });
    const later = date(NOV1 + 30 * 86400, { finalTE: 260, chain: [260] });
    const cards = buildCards(input([passed, date(NOV1), later]));
    expect(cards[2].title).toBe('By Nov 1');
  });
  it('Last run is the newest of sent, saved and kept; Saved counts both lists', () => {
    const cards = buildCards(
      input([race()], {
        local: {
          answers: [{ savedAt: NOW - 2 * DAY, deadline: NOV1, chain: null, spare: null }],
          runs: [{ savedAt: NOW - 3 * DAY }],
          pending: [{ createdAt: NOW - 3600_000, deadline: null }],
        },
      })
    );
    expect(cards[3].main).toBe('1 answer, 1 run');
    expect(cards[3].lines).toEqual(['1 result not sent']);
    expect(cards[4].lines).toEqual(['11:00 am', 'not sent yet']);
  });
  it('hours: any hour, and time off in the setup words', () => {
    const c = buildCards(
      input([], {
        setup: { availability: null, timeOff: [{ from: '2026-10-20', to: '2026-10-22' }], rememberedAt: null },
      })
    )[5];
    expect(c.main).toBe('Any hour');
    expect(c.lines).toEqual(['time off Oct 20–22']);
  });
});

describe('next steps', () => {
  it('nothing to flag for current runs priced with these hours, at Exact, recently, Egg Day included', () => {
    const s = buildSteps(input([race(), date(EGG)]));
    expect(s.steps).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.noRuns).toBe(false);
  });
  it('1. no Egg Day run: none sent, saved or kept; any of those (a look-alike too) clears it', () => {
    expect(ids(input([race()]))).toEqual(['eggday']);
    const step = buildSteps(input([race()])).steps[0];
    expect(step.button).toBe('Find my Egg Day answer');
    expect(step.action).toEqual({ to: 'by-date', deadline: EGG, eggDay: true, tab: 'nearby' });
    expect(ids(input([race(), date(EGG, { yours: false })]))).toEqual([]);
    expect(
      ids(
        input([race()], {
          local: { answers: [{ savedAt: NOW, deadline: EGG, chain: [250], spare: 1 }], runs: [], pending: [] },
        })
      )
    ).toEqual([]);
    expect(
      ids(input([race()], { local: { answers: [], runs: [], pending: [{ createdAt: NOW, deadline: EGG }] } }))
    ).toEqual(['unsent']);
  });
  it('no runs at all: the Egg Day step and noRuns; while the board loads, no board steps', () => {
    const s = buildSteps(input([]));
    expect(s.noRuns).toBe(true);
    expect(s.steps.map(x => x.id)).toEqual(['eggday']);
    const loading = buildSteps(input(null));
    expect(loading.loading).toBe(true);
    expect(loading.steps).toEqual([]);
  });
  it('2. other hours: any hour then, hours now (and the reverse, and other time off)', () => {
    const anyHour = buildSteps(input([race({ window: null }), date(EGG)])).steps;
    expect(anyHour).toHaveLength(1);
    expect(anyHour[0].kinds).toEqual(['hours']);
    expect(anyHour[0].text).toBe('Race to 490 was priced with any hour');
    expect(anyHour[0].reason).toBe('Your setup has your hours 9 am to 1 am now.');
    expect(anyHour[0].button).toBe('Rerun with my hours');
    expect(anyHour[0].action).toEqual({ to: 'fastest', target: 490, tab: 'nearby', level: 'normal' });
    const nowAny = input([race(), date(EGG)], { setup: { availability: null, timeOff: [], rememberedAt: null } });
    expect(kinds(nowAny)).toEqual(['hours', 'hours']);
    const off = input([race(), date(EGG)], {
      setup: { availability: HOURS, timeOff: [{ from: '2026-10-20', to: '2026-10-22' }], rememberedAt: null },
    });
    expect(buildSteps(off).steps[0].text).toBe('Egg Day 2027 was priced with other time off');
  });
  it('hours: a row from before `window` is not judged; time off that has ended is not compared', () => {
    expect(hoursDiffer(race({ window: undefined }), { availability: null, timeOff: [] }, NOW, ZONE).hours).toBe(false);
    const ended = race({ timeOff: [{ from: '2026-09-01', to: '2026-09-03' }] });
    expect(hoursDiffer(ended, { availability: HOURS, timeOff: [] }, NOW, ZONE)).toEqual({
      hours: false,
      timeOff: false,
    });
  });
  it('3. an older simulator: another stamp; no stamp before 13 Oct is "likely"; no stamp after is not judged', () => {
    expect(simulatorAge(race())).toBeNull();
    expect(simulatorAge(race({ simVersion: '2026-10-01-old' }))).toBe('older');
    const early = new Date(SIM_STAMPED_FROM_MS - DAY).toISOString();
    expect(simulatorAge(race({ simVersion: undefined, receivedAt: early }))).toBe('likely');
    expect(simulatorAge(race({ simVersion: undefined }))).toBeNull();
    const s = buildSteps(input([race({ simVersion: '2026-10-01-old' }), date(EGG)])).steps;
    expect(s[0].text).toBe('Race to 490: priced by an older simulator');
    expect(s[0].button).toBe('Run again');
    const likely = buildSteps(
      input([race({ simVersion: undefined, receivedAt: new Date(NOW - 3 * DAY).toISOString() }), date(EGG)], {
        now: SIM_STAMPED_FROM_MS + DAY,
      })
    ).steps;
    expect(likely[0].text).toBe('Race to 490: likely priced by an older simulator');
  });
  it('4. the save moved on: TE above the run’s, or sent over a week ago (by the injected now)', () => {
    const te = buildSteps(input([race(), date(EGG)], { teNow: 195 })).steps;
    expect(te.map(s => s.kinds)).toEqual([['moved'], ['moved']]);
    expect(te[1].reason).toBe('Your TE went 180 → 195 since this run.');
    const sent = new Date(NOW).toISOString();
    expect(
      ids(input([race({ receivedAt: sent }), date(EGG, { receivedAt: sent })], { now: NOW + STALE_AFTER_MS - 1 }))
    ).toEqual([]);
    const old = buildSteps(
      input([race({ receivedAt: sent }), date(EGG, { receivedAt: sent })], { now: NOW + STALE_AFTER_MS + 2 * DAY })
    ).steps;
    expect(old.map(s => s.text)).toEqual(['Egg Day 2027: sent 9 days ago', 'Race to 490: sent 9 days ago']);
  });
  it('a goal no longer ahead raises nothing; several reasons on one goal make one item', () => {
    expect(ids(input([race({ window: null }), date(EGG, { backupTE: 490 })], { teNow: 490 }))).toEqual([]);
    const s = buildSteps(
      input([race({ window: null, simVersion: 'x' }), date(EGG, { backupTE: 200 })], { teNow: 200 })
    ).steps;
    expect(s).toHaveLength(1);
    expect(s[0].kinds).toEqual(['simulator', 'hours', 'moved']);
    expect(s[0].button).toBe('Rerun with my hours');
  });
  it('look-alike rows never raise a step on their own, and a sure best is judged without them', () => {
    const maybeOnly = input(
      [race({ yours: false, window: null, simVersion: 'x', effort: 'quick' }), date(EGG, { backupTE: 300 })],
      {
        teNow: 300,
      }
    );
    expect(ids(maybeOnly)).toEqual([]);
    // A look-alike that beats the sure run is not "your best": the sure one is judged.
    const sure = race({ durationDays: 120 });
    const better = race({ durationDays: 80, chain: [250, 490], yours: false, window: null });
    expect(ids(input([sure, better, date(EGG)]))).toEqual([]);
  });
  it('6. a race only ever at Fast: Run at Exact (Exact level, Nearby); a date only by Nearby routes: Try Exhaustive', () => {
    const fast = input([race({ effort: 'quick' }), race({ effort: 'quick', chain: [250, 490] }), date(EGG)]);
    const step = buildSteps(fast).steps[0];
    expect(step.text).toBe('Race to 490: only Fast so far, never Exact');
    expect(step.action).toEqual({ to: 'fastest', target: 490, tab: 'nearby', level: 'normal' });
    expect(ids(input([race({ effort: 'quick' }), race({ effort: 'normal', chain: [250, 490] }), date(EGG)]))).toEqual(
      []
    );
    expect(ids(input([race({ effort: 'quick', space: {} as BoardRow['space'] }), date(EGG)]))).toEqual([]);
    const nearby = buildSteps(input([race(), date(EGG, { mode: 'simple' } as Partial<BoardRow>)])).steps[0];
    expect(nearby.text).toBe('Egg Day 2027: Nearby routes only, never Exhaustive');
    expect(nearby.action).toEqual({ to: 'by-date', deadline: EGG, eggDay: true, tab: 'exhaustive' });
    // A date row that doesn't say how it was found is not judged.
    expect(ids(input([race(), date(EGG, { mode: undefined } as Partial<BoardRow>)]))).toEqual([]);
  });
  it('7. unsent results and 8. hidden runs, last, the hidden one as information', () => {
    const s = buildSteps(
      input([race({ hidden: true }), date(EGG)], {
        local: { answers: [], runs: [], pending: [{ createdAt: NOW, deadline: null }] },
      })
    ).steps;
    expect(s.map(x => x.id)).toEqual(['unsent', 'hidden']);
    expect(s[0].action).toEqual({ to: 'unsent' });
    expect(s[0].text).toBe('1 result not sent');
    expect(s[1].action).toEqual({ to: 'board' });
    expect(s[1].info).toBe(true);
    expect(s[1].text).toBe('1 run hidden from the public');
  });
});

describe('actions', () => {
  it('rerun opens the goal where it was found, at its level', () => {
    expect(rerunAction(race({ effort: 'thorough' }), EGG)).toEqual({
      to: 'fastest',
      target: 490,
      tab: 'nearby',
      level: 'thorough',
    });
    expect(rerunAction(race({ space: {} as BoardRow['space'] }), EGG)).toEqual({
      to: 'fastest',
      target: 490,
      tab: 'exhaustive',
    });
    expect(rerunAction(date(NOV1, { mode: 'simple' } as Partial<BoardRow>), EGG)).toEqual({
      to: 'by-date',
      deadline: NOV1,
      eggDay: false,
      tab: 'nearby',
    });
  });
  it('openFor: Fastest with its depth and target; By a date with Egg Day or the date in the planner’s zone', () => {
    expect(openFor({ to: 'fastest', target: 490, tab: 'nearby', level: 'normal' }, ZONE)).toEqual({
      auto: 'fastest',
      depth: 'smart',
      tab: 'nearby',
      target: 490,
      level: 'normal',
    });
    expect(openFor({ to: 'fastest', target: 400, tab: 'exhaustive' }, ZONE).depth).toBe('full');
    expect(openFor({ to: 'by-date', deadline: EGG, eggDay: true, tab: 'nearby' }, ZONE)).toEqual({
      auto: 'by-date',
      tab: 'nearby',
      byDate: { eggDay: true },
    });
    expect(openFor({ to: 'by-date', deadline: NOV1, eggDay: false, tab: 'exhaustive' }, ZONE).byDate).toEqual({
      deadline: NOV1,
      zone: ZONE,
    });
  });
});
