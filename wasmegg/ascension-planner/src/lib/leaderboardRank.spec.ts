import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  accountKeyOf,
  browserTag,
  buildMyPlans,
  buildRace,
  calendarDaysLeft,
  daysLeft,
  daysLeftPhrase,
  daysLeftText,
  displayName,
  fileRows,
  finishDateText,
  finishMs,
  foldCopies,
  gapToBest,
  groupPlayers,
  localToUtcMs,
  nameLabel,
  placeFor,
  plannedText,
  playerKey,
  projectedTE,
  remainingChain,
  sameBuild,
  samePlan,
  sameSave,
  scheduleText,
  settingTags,
  type BoardRow,
} from './leaderboardRank';
import { sortRows } from './leaderboardSort';

const CHICAGO = 'America/Chicago';
const WINDOW = `every day 07:00-23:00 ${CHICAGO}`;
const ALLAN_GEAR = ['T4L Gusset', 'T4L Chalice', 'T4L Metronome', 'T4L Compass'];
const NOW = Date.parse('2026-09-25T23:59:00Z');

/** `YYYY-MM-DD HH:MM` for instant `ms` in `timezone`: the inverse of what the lib parses. */
function stamp(ms: number, timezone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map(x => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

let seq = 0;
/** A row shaped like Allan's 25 Sep run of 225 255 290 328 490, with overrides. */
function row(over: Partial<BoardRow> = {}): BoardRow {
  seq++;
  return {
    id: `r${seq}`,
    nickname: 'allanfieldhouse',
    chain: [225, 255, 290, 328, 490],
    durationDays: 663.2713,
    startLocal: '2026-09-25 13:52',
    timezone: CHICAGO,
    currentTE: 199,
    finalTE: 490,
    window: WINDOW,
    effort: 'balanced',
    holdShifts: true,
    forceContinue: true,
    submittedAt: '2026-09-25T20:01:58.115Z',
    backupAgeHours: 0,
    artifacts: ALLAN_GEAR,
    legs: [
      { te: 225, days: 60 },
      { te: 255, days: 70 },
      { te: 290, days: 80 },
      { te: 328, days: 90 },
      { te: 490, days: 363.2713 },
    ],
    ...over,
  };
}

/** A rival on another account, finishing `finishDays` after NOW. */
function rival(nickname: string, finishDays: number, over: Partial<BoardRow> = {}): BoardRow {
  const start = NOW - 2 * DAY_MS;
  return row({
    nickname,
    timezone: 'Europe/London',
    window: null,
    artifacts: ['T3E Gusset'],
    currentTE: 178,
    chain: [194, 215, 490],
    startLocal: stamp(start, 'Europe/London'),
    submittedAt: new Date(start + 60_000).toISOString(),
    durationDays: finishDays + 2,
    legs: [],
    ...over,
  });
}

describe('finish', () => {
  it('reads the start in the row timezone and adds the plan length', () => {
    // 13:52 in Chicago on 25 Sep is CDT, UTC-5.
    expect(localToUtcMs('2026-09-25 13:52', CHICAGO)).toBe(Date.parse('2026-09-25T18:52:00Z'));
    // In December it is CST, UTC-6: the offset is looked up for the date, not assumed.
    expect(localToUtcMs('2026-12-01 13:52', CHICAGO)).toBe(Date.parse('2026-12-01T19:52:00Z'));
    const r = row();
    expect(finishMs(r)).toBe(Date.parse('2026-09-25T18:52:00Z') + 663.2713 * DAY_MS);
    expect(daysLeft(r, NOW)).toBeCloseTo(663.2713 - (NOW - Date.parse('2026-09-25T18:52:00Z')) / DAY_MS, 9);
  });

  it('is null, never NaN, when it cannot be worked out', () => {
    const bad: Partial<BoardRow>[] = [
      { startLocal: 'soon' },
      { startLocal: undefined },
      { startLocal: '2026-13-40 25:61' },
      { timezone: 'Mars/Olympus_Mons' },
      { timezone: undefined },
      { durationDays: NaN },
      { durationDays: Infinity },
      { durationDays: undefined as unknown as number },
    ];
    for (const over of bad) {
      const r = row(over);
      expect(finishMs(r)).toBeNull();
      expect(daysLeft(r, NOW)).toBeNull();
    }
  });

  it('keeps an unreadable finish out of first place, and the sort stays consistent', () => {
    const good = row({ id: 'good' });
    const broken = row({ id: 'broken', timezone: 'Nowhere/Void', durationDays: 1 });
    const sooner = row({ id: 'sooner', durationDays: 600 });
    const view = [broken, good, sooner].map(r => ({ id: r.id, finish: finishMs(r) ?? NaN }));
    expect(sortRows(view, 'finish', true).map(r => r.id)).toEqual(['sooner', 'good', 'broken']);
    expect(sortRows(view, 'finish', false).map(r => r.id)).toEqual(['good', 'sooner', 'broken']);

    const plans = groupPlayers([broken], { target: 490, now: NOW })[0].plans;
    expect(plans[0].state).toBe('no-date');
    expect(buildRace([broken], { target: 490, now: NOW }).entries).toEqual([]);
  });
});

describe("Allan's daily re-run", () => {
  // The same plan, run every day for a month while he plays along it. Each run is a day shorter
  // because it starts a day later, and finishes at the same moment.
  const base = Date.parse('2026-08-27T18:52:00Z');
  const finish = base + 663.2713 * DAY_MS;
  const days = Array.from({ length: 30 }, (_, i) => {
    const start = base + i * DAY_MS;
    return row({
      id: `day${i + 1}`,
      startLocal: stamp(start, CHICAGO),
      submittedAt: new Date(start + 20 * 60_000).toISOString(),
      durationDays: 663.2713 - i,
      // On track: the first leg gains 26 TE in 60 days.
      currentTE: Math.floor(199 + (26 * i) / 60),
      chain: [225, 255, 290, 328, 490],
      legs: [
        { te: 225, days: 60 - i },
        { te: 255, days: 70 },
        { te: 290, days: 80 },
        { te: 328, days: 90 },
        { te: 490, days: 363.2713 },
      ],
    });
  });
  const kenzie = rival('Kenzie', 700);
  const now = base + 30 * DAY_MS;

  it('is what the old Days sort got wrong: the newest run always looked fastest', () => {
    expect(sortRows(days, 'durationDays', true)[0].id).toBe('day30');
  });

  it('shows as ONE plan with the same finish, and never moves the player', () => {
    for (let k = 1; k <= days.length; k++) {
      const race = buildRace([...days.slice(0, k), kenzie], { target: 490, now });
      expect(race.entries.map(e => e.label)).toEqual(['allanfieldhouse', 'Kenzie']);
      const allan = race.entries[0];
      expect(allan.rank).toBe(1);
      expect(allan.best.finish).toBe(finish);
      expect(allan.best.row.id).toBe(`day${k}`);
      expect(allan.others).toEqual([]);
      expect(allan.dropped).toEqual([]);
      expect(allan.plansTried).toBe(1);
      if (k > 1) {
        expect(allan.best.recheck).toEqual({ count: k, movedDays: 0, unchanged: true });
        expect(allan.best.earlier.map(p => p.reason)).toEqual(
          Array.from({ length: k - 1 }, () => expect.stringContaining('replaced by a newer run of the same plan'))
        );
      }
    }
  });

  it('keeps it one plan once he passes a target and the route drops it', () => {
    const passed = row({
      id: 'passed',
      startLocal: stamp(base + 61 * DAY_MS, CHICAGO),
      submittedAt: new Date(base + 61 * DAY_MS + 60_000).toISOString(),
      durationDays: 663.2713 - 61,
      currentTE: 226,
      chain: [255, 290, 328, 490],
      legs: [],
    });
    expect(remainingChain([225, 255, 290, 328, 490], 226)).toEqual([255, 290, 328, 490]);
    expect(samePlan(days[0], passed)).toBe(true);
    const race = buildRace([days[0], passed], { target: 490, now: base + 62 * DAY_MS });
    expect(race.entries[0].best.row.id).toBe('passed');
    expect(race.entries[0].best.recheck?.count).toBe(2);
  });
});

describe('an unnamed re-run of a named plan', () => {
  // Day 1: Allan sends 225 255 290 328 490 with his name, plus a 230 490 route 10 days slower.
  // Day 2: the Submit panel is back on "anonymous", and the same plan is re-run and sent unnamed.
  const d1 = Date.parse('2026-09-24T18:52:00Z');
  const d2 = d1 + DAY_MS;
  const at = (ms: number) => ({
    startLocal: stamp(ms, CHICAGO),
    submittedAt: new Date(ms + 20 * 60_000).toISOString(),
  });
  const named = row({
    id: 'named',
    ...at(d1),
    durationDays: 664.2713,
    legs: [
      { te: 225, days: 61 },
      { te: 255, days: 70 },
      { te: 290, days: 80 },
      { te: 328, days: 90 },
      { te: 490, days: 363.2713 },
    ],
  });
  const slower = row({
    id: 'slower',
    ...at(d1),
    chain: [230, 490],
    durationDays: 674.2713,
    legs: [
      { te: 230, days: 70 },
      { te: 490, days: 604.2713 },
    ],
  });
  const unnamed = row({ id: 'unnamed', nickname: undefined, ...at(d2) });
  const kenzie = rival('Kenzie', 700);
  const now = d2 + 2 * 3_600_000;

  it('keeps the player on the same finish and rank, and counts it as a re-check', () => {
    const race = buildRace([named, slower, unnamed, kenzie], { target: 490, now });
    expect(race.entries.map(e => [e.rank, e.label])).toEqual([
      [1, 'allanfieldhouse'],
      [2, 'Kenzie'],
    ]);
    const allan = race.entries[0];
    expect(allan.best.finish).toBe(finishMs(named));
    expect(allan.best.row.id).toBe('unnamed');
    expect(allan.best.recheck).toEqual({ count: 2, movedDays: 0, unchanged: true });
    expect(allan.best.earlier.map(p => p.row.id)).toEqual(['named']);
    expect(allan.others.map(p => p.row.id)).toEqual(['slower']);
    expect(allan.dropped).toEqual([]);
    expect(race.waiting).toEqual([]);
  });

  it('does not drop a player whose only plan was re-run unnamed', () => {
    const race = buildRace([named, unnamed], { target: 490, now });
    expect(race.entries.map(e => e.label)).toEqual(['allanfieldhouse']);
    expect(race.entries[0].best.finish).toBe(finishMs(named));
    expect(race.waiting).toEqual([]);
  });

  it('agrees with My plans, so the header rank is the rank of this plan', () => {
    const rows = [named, slower, unnamed, kenzie];
    const race = buildRace(rows, { target: 490, now });
    const mine = buildMyPlans(rows, accountKeyOf(named), { target: 490, now })!;
    expect(mine.best!.finish).toBe(race.entries[0].best.finish);
    expect(mine.best!.recheck?.count).toBe(2);
  });

  it('never lets a run under a different name replace the plan', () => {
    const other = row({ id: 'other', nickname: 'altfieldhouse', ...at(d2) });
    const race = buildRace([named, other], { target: 490, now });
    const allan = race.entries.find(e => e.label === 'allanfieldhouse')!;
    expect(allan.best.row.id).toBe('named');
    expect(allan.best.recheck).toBeNull();
    expect(race.entries.map(e => e.label).sort()).toEqual(['allanfieldhouse', 'altfieldhouse']);
  });
});

describe('copies', () => {
  // Allan's anonymous send of 225 255 290 328 490 and the named one 46 minutes later.
  const anon = row({ id: 'anon', nickname: undefined, submittedAt: '2026-09-25T19:15:55.578Z' });
  const named = row({ id: 'named', submittedAt: '2026-09-25T20:01:58.115Z' });

  it('folds an anonymous copy into the named one', () => {
    const folded = foldCopies([anon, named]);
    expect(folded).toHaveLength(1);
    expect(folded[0].copies.map(c => c.id)).toEqual(['anon', 'named']);
    expect(folded[0].row.nickname).toBe('allanfieldhouse');
    const race = buildRace([anon, named], { target: 490, now: NOW });
    expect(race.entries).toHaveLength(1);
    expect(race.entries[0].sends).toBe(2);
    expect(race.entries[0].plansTried).toBe(1);
  });

  it('does not fold two plans that differ only in finishing the current ascension', () => {
    // Halceyx's 277 490 pair: same start, same length, forceContinue false vs true.
    const base = {
      nickname: 'Halceyx',
      chain: [277, 490],
      startLocal: '2026-09-24 18:26',
      timezone: 'America/Los_Angeles',
      durationDays: 1120.7104,
      currentTE: 124,
      window: null,
      artifacts: ['T4R Gusset'],
      legs: [],
    };
    const off = row({ ...base, id: 'off', forceContinue: false, submittedAt: '2026-09-25T01:35:04.526Z' });
    const on = row({ ...base, id: 'on', forceContinue: true, submittedAt: '2026-09-25T01:29:55.393Z' });
    expect(foldCopies([off, on])).toHaveLength(2);
    expect(samePlan(on, off)).toBe(false);
    const halceyx = buildRace([off, on], { target: 490, now: NOW }).entries[0];
    expect(halceyx.plansTried).toBe(2);
    expect([halceyx.best, ...halceyx.others].map(p => p.row.id).sort()).toEqual(['off', 'on']);
    // The two lines would read the same, so each says which one it is.
    const lone = row({ ...base, id: 'lone', chain: [300, 490], forceContinue: true });
    const tags = settingTags([off, on, lone]);
    expect(tags.get(off)).toEqual(['prestiges now']);
    expect(tags.get(on)).toEqual(['finishes current run first']);
    expect(tags.has(lone)).toBe(false);
  });

  it('folds copies sent under a name and the same name with a note bolted on', () => {
    // The same result sent as `Williamthe5thc` and, 2 minutes later, `Williamthe5thc- 7 Ascen`.
    const base = { timezone: 'America/Denver', artifacts: ['T4L Gusset', 'T4E Chalice'], currentTE: 180, legs: [] };
    const plain = row({ ...base, id: 'plain', nickname: 'Williamthe5thc', submittedAt: '2026-09-25T20:06:00Z' });
    const noted = row({
      ...base,
      id: 'noted',
      nickname: 'Williamthe5thc- 7 Ascen',
      submittedAt: '2026-09-25T20:08:00Z',
    });
    const folded = foldCopies([plain, noted]);
    expect(folded).toHaveLength(1);
    expect(folded[0].row.nickname).toBe('Williamthe5thc');
    const will = buildRace([plain, noted], { target: 490, now: NOW }).entries[0];
    expect([will.label, will.plansTried, will.sends, will.others.length]).toEqual(['Williamthe5thc', 1, 2, 0]);
  });

  it('never hands one name the line of another', () => {
    const copied = row({ id: 'copied', nickname: 'someone else', submittedAt: '2026-09-25T21:00:00Z' });
    expect(foldCopies([named, copied])).toHaveLength(2);
  });
});

describe('plans that no longer count', () => {
  it('drops a what-if start', () => {
    // rontimes planned on 14 Sep what would happen if he started on 23 Nov.
    const r = row({
      id: 'whatif',
      nickname: 'rontimes',
      startLocal: '2026-11-23 17:00',
      submittedAt: '2026-09-14T22:00:00Z',
      durationDays: 500,
    });
    const real = row({
      id: 'real',
      nickname: 'rontimes',
      startLocal: '2026-09-14 17:08',
      submittedAt: '2026-09-14T22:10:00Z',
    });
    const p = buildRace([r, real], { target: 490, now: NOW }).entries[0];
    expect(p.best.row.id).toBe('real');
    expect(p.dropped.map(d => [d.row.id, d.state])).toEqual([['whatif', 'what-if']]);
    expect(p.dropped[0].reason).toMatch(/^what-if start/);
  });

  it('drops a plan made from a higher TE than a later run shows', () => {
    const high = row({
      id: 'high',
      currentTE: 201,
      startLocal: '2026-09-20 10:00',
      submittedAt: '2026-09-20T15:05:00Z',
    });
    const later = row({
      id: 'later',
      currentTE: 161,
      chain: [200, 490],
      startLocal: '2026-09-22 10:00',
      submittedAt: '2026-09-22T15:05:00Z',
    });
    const plans = groupPlayers([high, later], { target: 490, now: NOW })[0].plans;
    const judged = Object.fromEntries(plans.map(p => [p.row.id, p.state]));
    expect(judged).toEqual({ high: 'what-if', later: 'current' });
  });

  it('catches a what-if when the real run comes only half an hour later', () => {
    // A plan made from TE 215 at 10:00, then a real run from today's save (TE 199) at 10:30.
    const whatIf = row({
      id: 'whatif',
      currentTE: 215,
      chain: [240, 490],
      durationDays: 600,
      startLocal: '2026-09-25 10:00',
      submittedAt: '2026-09-25T15:00:00Z',
      legs: [],
    });
    const real = row({ id: 'real', startLocal: '2026-09-25 10:30', submittedAt: '2026-09-25T15:30:00Z' });
    const race = buildRace([whatIf, real], { target: 490, now: NOW });
    expect(race.entries[0].best.row.id).toBe('real');
    expect(race.entries[0].dropped.map(d => [d.row.id, d.reason])).toEqual([
      ['whatif', 'what-if: planned from TE 215, a later run started at TE 199'],
    ]);
    // Both runs keeping the same plan start means one save, and one save has one TE: the higher
    // one was typed in, whichever of the two was sent first.
    const judge = (rows: BoardRow[]) =>
      Object.fromEntries(
        groupPlayers(rows, { target: 490, now: NOW })[0].plans.map(p => [p.row.id, [p.state, p.reason]])
      );
    const after = row({ id: 'real2', startLocal: '2026-09-25 10:00', submittedAt: '2026-09-25T15:30:00Z' });
    const before = row({ id: 'real3', startLocal: '2026-09-25 10:00', submittedAt: '2026-09-25T14:30:00Z' });
    for (const real of [after, before]) {
      expect(judge([whatIf, real])).toEqual({
        whatif: ['what-if', 'what-if: planned from TE 215, a run from the same plan start was at TE 199'],
        [real.id!]: ['current', ''],
      });
    }
  });

  it('does not take an old planner tab re-sent days later as proof of a what-if', () => {
    // A run from a session started on the 15th (TE 175), sent on the 20th, after a run started on
    // the 17th at TE 180. By plan start the TE only went up, so nothing is contradicted.
    const r180 = row({
      id: 'r180',
      currentTE: 180,
      chain: [195, 490],
      startLocal: '2026-09-17 10:00',
      submittedAt: '2026-09-17T15:05:00Z',
      legs: [],
    });
    const oldTab = row({
      id: 'oldTab',
      currentTE: 175,
      chain: [190, 490],
      startLocal: '2026-09-15 10:00',
      submittedAt: '2026-09-20T15:05:00Z',
      legs: [],
    });
    const plans = groupPlayers([r180, oldTab], { target: 490, now: NOW })[0].plans;
    expect(Object.fromEntries(plans.map(p => [p.row.id, p.state]))).toEqual({ r180: 'current', oldTab: 'current' });
  });

  it('never lets several what-ifs from a higher TE outvote the real run after them', () => {
    const whatIf = (id: string, day: number, first: number) =>
      row({
        id,
        currentTE: 215,
        chain: [first, 490],
        durationDays: 600,
        startLocal: `2026-09-${day} 10:00`,
        submittedAt: `2026-09-${day}T15:05:00Z`,
        legs: [],
      });
    const real = (id: string, day: number, chain: number[]) =>
      row({ id, chain, startLocal: `2026-09-${day} 10:00`, submittedAt: `2026-09-${day}T15:05:00Z`, legs: [] });
    const judge = (rows: BoardRow[]) =>
      Object.fromEntries(groupPlayers(rows, { target: 490, now: NOW })[0].plans.map(p => [p.row.id, p.state]));

    // (a) Three what-ifs on the 24th, then the real run on the 25th.
    const a = [whatIf('w0', 24, 240), whatIf('w1', 24, 241), whatIf('w2', 24, 242), real('real', 25, [225, 490])];
    expect(judge(a)).toEqual({ w0: 'what-if', w1: 'what-if', w2: 'what-if', real: 'current' });
    expect(buildRace(a, { target: 490, now: NOW }).entries[0].best.row.id).toBe('real');

    // (b) A real run, two what-ifs, then another real run at the same TE as the first.
    const b = [
      real('r22', 22, [230, 490]),
      whatIf('w23a', 23, 240),
      whatIf('w23b', 23, 241),
      real('r24', 24, [225, 490]),
    ];
    expect(judge(b)).toEqual({ r22: 'current', w23a: 'what-if', w23b: 'what-if', r24: 'current' });
    expect(buildRace(b, { target: 490, now: NOW }).entries[0].best.row.id).not.toMatch(/^w/);
  });

  it('takes a lower run as an old save when its own save is older than a run before it', () => {
    const fresh = row({
      id: 'fresh',
      currentTE: 180,
      chain: [195, 490],
      startLocal: '2026-09-24 10:00',
      submittedAt: '2026-09-24T15:05:00Z',
      backupAgeHours: 0.1,
      legs: [],
    });
    // Run a day later, but from a save taken three days before that: the account was at 159 then.
    const stale = row({
      id: 'stale',
      currentTE: 159,
      chain: [292, 490],
      startLocal: '2026-09-25 10:00',
      submittedAt: '2026-09-25T15:05:00Z',
      backupAgeHours: 72,
      legs: [],
    });
    const plans = groupPlayers([fresh, stale], { target: 490, now: NOW })[0].plans;
    expect(Object.fromEntries(plans.map(p => [p.row.id, p.state]))).toEqual({ fresh: 'current', stale: 'old-save' });
    // Without the save age there is no such signal: the newest, lower run makes the other a what-if.
    const plain = groupPlayers([fresh, { ...stale, backupAgeHours: undefined }], { target: 490, now: NOW })[0].plans;
    expect(Object.fromEntries(plain.map(p => [p.row.id, p.state]))).toEqual({ fresh: 'what-if', stale: 'current' });
  });

  it('does not let one run from an old save knock out every plan around it', () => {
    // Williamthe5thc's "(bad sync)": one run at TE 159 among runs at 180-182 before and after it.
    const at = (id: string, day: number, te: number, chain: number[]) =>
      row({
        id,
        nickname: 'Williamthe5thc',
        timezone: 'UTC',
        currentTE: te,
        chain,
        startLocal: `2026-09-${day} 12:00`,
        submittedAt: `2026-09-${day}T12:05:00Z`,
        legs: [],
      });
    const rows = [
      at('plan', 17, 180, [195, 216, 257, 289, 321, 490]),
      at('probe', 17, 180, [352, 490]),
      at('bad', 19, 159, [292, 490]),
      at('after', 20, 181, [195, 213, 218, 235, 254, 273, 291, 490]),
      at('latest', 24, 182, [195, 227, 270, 303, 490]),
    ];
    const plans = groupPlayers(rows, { target: 490, now: NOW })[0].plans;
    const judged = Object.fromEntries(plans.map(p => [p.row.id, p.state]));
    expect(judged).toEqual({ plan: 'current', probe: 'current', bad: 'old-save', after: 'current', latest: 'current' });
    expect(plans.find(p => p.row.id === 'bad')!.reason).toMatch(
      /^made from an old save: TE 159, but a run on 17 \w+ already had TE 180$/
    );
  });

  it('drops a plan the player has fallen behind', () => {
    // Planned from TE 190 at 1 TE a day. 12.4 days on, the plan says 202.4; the newest run is at 199.
    const promise = row({
      id: 'promise',
      timezone: 'UTC',
      currentTE: 190,
      chain: [225, 490],
      startLocal: '2026-09-13 12:00',
      submittedAt: '2026-09-13T12:05:00Z',
      durationDays: 640,
      legs: [
        { te: 225, days: 35 },
        { te: 490, days: 605 },
      ],
    });
    const now = row({
      id: 'now',
      timezone: 'UTC',
      currentTE: 199,
      chain: [230, 490],
      startLocal: '2026-09-25 21:36',
      submittedAt: '2026-09-25T21:40:00Z',
      durationDays: 700,
    });
    expect(projectedTE(promise, Date.parse('2026-09-25T21:36:00Z'))).toBeCloseTo(202.4, 9);
    const p = buildRace([promise, now], { target: 490, now: NOW }).entries[0];
    expect(p.best.row.id).toBe('now');
    expect(p.dropped.map(d => [d.row.id, d.state, d.reason])).toEqual([
      ['promise', 'behind', 'behind: at TE 199 now, the plan said 202.4'],
    ]);
  });

  it('keeps a plan the player is on track with, and says so', () => {
    const plan = row({
      id: 'plan',
      timezone: 'UTC',
      currentTE: 180,
      chain: [195, 490],
      startLocal: '2026-09-17 21:21',
      submittedAt: '2026-09-17T21:30:00Z',
      durationDays: 731.86,
      legs: [
        { te: 195, days: 30 },
        { te: 490, days: 701.86 },
      ],
    });
    const probe = row({
      id: 'probe',
      timezone: 'UTC',
      currentTE: 182,
      chain: [490],
      startLocal: '2026-09-23 12:00',
      submittedAt: '2026-09-23T12:05:00Z',
      durationDays: 900,
    });
    const p = buildRace([plan, probe], { target: 490, now: NOW }).entries[0];
    // A one-ascension probe is a different plan: it cannot replace the better one.
    expect(p.best.row.id).toBe('plan');
    expect(p.best.progress?.te).toBe(182);
    expect(p.best.progress?.projected).toBeCloseTo(182.8, 1);
    expect(p.others.map(o => o.row.id)).toEqual(['probe']);
    // Read on the viewer's calendar, like the finish beside it: 21:21 UTC is already the 18th in Tokyo.
    expect(plannedText(p.best, { zone: 'UTC' })).toMatch(/^17 Sep\w* · on track \(TE 182, plan said 182\.8\)$/);
    expect(plannedText(p.best, { zone: 'Asia/Tokyo', brief: true })).toMatch(/^18 Sep\w* · on track$/);
  });

  it('lets a newer run of the same plan replace the older one even when it finishes later', () => {
    const first = row({
      id: 'first',
      startLocal: '2026-09-23 10:46',
      submittedAt: '2026-09-23T15:50:00Z',
      durationDays: 665.7,
    });
    const firstFinish = finishMs(first)!;
    // Re-priced two days later from a new save: 1.5 days later than the first measurement said.
    const again = row({
      id: 'again',
      startLocal: '2026-09-25 10:46',
      submittedAt: '2026-09-25T15:50:00Z',
      durationDays: 665.7 - 2 + 1.5,
    });
    const allan = buildRace([first, again], { target: 490, now: NOW }).entries[0];
    expect(allan.best.row.id).toBe('again');
    expect(allan.best.finish! - firstFinish).toBeCloseTo(1.5 * DAY_MS, 0);
    expect(allan.best.recheck?.count).toBe(2);
    expect(allan.best.recheck?.movedDays).toBeCloseTo(1.5, 6);
    expect(allan.best.recheck?.unchanged).toBe(false);
    expect(allan.best.earlier.map(p => p.row.id)).toEqual(['first']);
    expect(allan.plansTried).toBe(1);
  });

  it('drops a plan older than 30 days', () => {
    const old = row({ id: 'old', startLocal: '2026-08-01 10:00', submittedAt: '2026-08-01T15:05:00Z' });
    const race = buildRace([old], { target: 490, now: NOW });
    expect(race.entries).toEqual([]);
    expect(race.waiting.map(w => w.dropped[0].reason)).toEqual(['older than 30 days']);
  });
});

describe('who is in the race', () => {
  it('ranks named players only; anonymous runs stay out', () => {
    const anonFast = rival('', 100, { nickname: undefined, timezone: 'Asia/Tokyo', artifacts: ['T4L Chalice'] });
    const race = buildRace([anonFast, rival('Kenzie', 700), row()], { target: 490, now: NOW });
    expect(race.entries.map(e => [e.rank, e.label])).toEqual([
      [1, 'allanfieldhouse'],
      [2, 'Kenzie'],
    ]);
    // Still a player the lib knows about, for All runs and for the viewer's own plans.
    expect(groupPlayers([anonFast], { target: 490, now: NOW })[0].named).toBe(false);
  });

  it('ranks by finish date, not by plan length', () => {
    // Planned 20 days ago: a longer plan, from an earlier start, that still finishes first.
    const start = NOW - 20 * DAY_MS;
    const ahead = rival('ahead', 650, {
      durationDays: 670,
      startLocal: stamp(start, 'Europe/London'),
      submittedAt: new Date(start + 60_000).toISOString(),
      artifacts: ['T4E Gusset'],
    });
    const behind = rival('behind', 660);
    expect(sortRows([ahead, behind], 'durationDays', true)[0].nickname).toBe('behind');
    const race = buildRace([ahead, behind], { target: 490, now: NOW });
    expect(race.entries.map(e => [e.label, Math.round(daysLeft(e.best.row, NOW)!)])).toEqual([
      ['ahead', 650],
      ['behind', 660],
    ]);
  });

  it('files the notes people type into the name box under one player', () => {
    expect(nameLabel('Williamthe5thc 2026-09-18 09:53')).toBe('Williamthe5thc');
    expect(nameLabel('Willsalt(2 ascent)')).toBe('Willsalt');
    expect(nameLabel('Willsalt(2 ascent) 2026-09-20 12:02')).toBe('Willsalt');
    expect(nameLabel('​Ken‍zie﻿')).toBe('Kenzie');
    const will = (nickname: string, day: number, chain: number[]) =>
      rival(nickname, 700 + day, { timezone: 'America/New_York', startLocal: `2026-09-${10 + day} 10:00`, chain });
    const race = buildRace(
      [
        will('Williamthe5thc', 1, [195, 490]),
        will('Williamthe5thc 2026-09-18 09:53', 2, [196, 490]),
        will('Williamthe5thc (bad sync)', 3, [197, 490]),
      ],
      { target: 490, now: NOW }
    );
    expect(race.entries.map(e => [e.label, e.plansTried])).toEqual([['Williamthe5thc', 3]]);
  });

  it('keeps an alt called "Kenzie Alt" apart from Kenzie', () => {
    const at = (nickname: string, day: number, te: number, gear: string[], days: number) =>
      rival(nickname, days, {
        currentTE: te,
        artifacts: gear,
        chain: [te + 20, 490],
        startLocal: `2026-09-${day} 10:00`,
        submittedAt: `2026-09-${day}T09:05:00Z`,
      });
    const main = ['T4L Gusset', 'T4E Chalice'];
    const alt = ['T2C Gusset'];
    const rows = [
      at('Kenzie', 20, 178, main, 700),
      at('Kenzie', 21, 178, main, 701),
      at('Kenzie Alt', 22, 60, alt, 2000),
      at('Kenzie Alt', 23, 60, alt, 2001),
      at('Kenzie Alt', 24, 61, alt, 2002),
    ];
    const race = buildRace(rows, { target: 490, now: NOW });
    expect(race.entries.map(e => [e.rank, e.label])).toEqual([
      [1, 'Kenzie'],
      [2, 'Kenzie Alt'],
    ]);
    expect(race.entries[0].dropped).toEqual([]);
    expect(race.entries[0].best.row.currentTE).toBe(178);
    // The same note from the SAME account is still one player.
    const noted = at('Kenzie - farming', 22, 178, main, 702);
    const one = buildRace([...rows.slice(0, 2), noted], { target: 490, now: NOW });
    expect(one.entries.map(e => [e.label, e.sends])).toEqual([['Kenzie', 3]]);
  });

  it('shows a name with no letters as an icon and a city', () => {
    const icon = '';
    expect(displayName(icon, 'America/Los_Angeles')).toBe('(icon) · Los Angeles');
    const race = buildRace([rival(icon, 700, { timezone: 'America/Los_Angeles' })], { target: 490, now: NOW });
    expect(race.entries[0].label).toBe('(icon) · Los Angeles');
  });
});

describe('my plans', () => {
  const key = accountKeyOf(row());

  it('is only my account, and compares finishes only between plans from the same save', () => {
    const best = row({ id: 'best' });
    const sameSave = row({ id: 'same', chain: [230, 260, 297, 490], durationDays: 663.6613 });
    const olderSave = row({
      id: 'older',
      chain: [199, 233, 281, 315, 490],
      currentTE: 198,
      startLocal: '2026-09-23 12:13',
      submittedAt: '2026-09-23T17:20:00Z',
      durationDays: 666.0,
    });
    const mine = buildMyPlans([best, sameSave, olderSave, rival('Kenzie', 700)], key, { target: 490, now: NOW })!;
    expect(mine).not.toBeNull();
    expect(mine.best!.row.id).toBe('best');
    const gap = Object.fromEntries(mine.others.map(p => [p.row.id, gapToBest(p, mine.best!)]));
    expect(gap.same).toBeCloseTo(0.39, 6);
    expect(gap.older).toBeNull();
  });

  it('says where I would place, and is null when nothing on the board is mine', () => {
    const race = buildRace([rival('Kenzie', 700), rival('Zen', 900)], { target: 490, now: NOW });
    const mine = buildMyPlans([row({ nickname: undefined })], key, { target: 490, now: NOW })!;
    expect(placeFor(race, mine.best!.finish)).toBe(1);
    expect(placeFor(race, NOW + 800 * DAY_MS)).toBe(2);
    expect(placeFor(race, null)).toBeNull();
    expect(buildMyPlans([rival('Kenzie', 700)], key, { target: 490, now: NOW })).toBeNull();
  });
});

describe('finish dates and days left', () => {
  it('counts calendar days in the zone the date is shown in, so the two always agree', () => {
    const zone = 'America/Chicago';
    // Finishes every 3 hours across a few days around 663 days out.
    const finishes = Array.from({ length: 40 }, (_, i) => NOW + 661.5 * DAY_MS + i * 3 * 3_600_000);
    const byDate = new Map<string, Set<string>>();
    let prev = -Infinity;
    for (const f of finishes) {
      const date = finishDateText(f, zone);
      const left = daysLeftText(f, NOW, zone);
      if (!byDate.has(date)) byDate.set(date, new Set());
      byDate.get(date)!.add(left);
      expect(Number(left)).toBeGreaterThanOrEqual(prev);
      prev = Number(left);
    }
    for (const lefts of byDate.values()) expect(lefts.size).toBe(1);
    expect(byDate.size).toBeGreaterThan(3);
    // The reviewer's case: 662.67, 663.06 and 663.40 exact days used to show 663, 663, 663 beside
    // two different dates. Now the later date is one more.
    const [a, b, c] = [662.67, 663.06, 663.4].map(d => NOW + d * DAY_MS);
    expect(finishDateText(a, zone)).toBe(finishDateText(b, zone));
    expect(daysLeftText(a, NOW, zone)).toBe(daysLeftText(b, NOW, zone));
    expect(finishDateText(c, zone)).not.toBe(finishDateText(b, zone));
    expect(Number(daysLeftText(c, NOW, zone))).toBe(Number(daysLeftText(b, NOW, zone)) + 1);
  });

  it('says a finish that has passed in words that read in a sentence', () => {
    const zone = 'UTC';
    expect(daysLeftText(NOW - DAY_MS, NOW, zone)).toBe('reached');
    expect(daysLeftPhrase(NOW - 7 * DAY_MS, NOW, zone)).toBe('date passed');
    expect(daysLeftPhrase(NOW + 30_000, NOW, zone)).toBe('today');
    expect(daysLeftPhrase(NOW + DAY_MS, NOW, zone)).toBe('1 day left');
    expect(daysLeftPhrase(NOW + 10 * DAY_MS, NOW, zone)).toBe('10 days left');
    expect(daysLeftPhrase(null, NOW, zone)).toBe('');
    expect(daysLeftText(NaN, NOW, zone)).toBe('—');
  });
});

describe('phase 2: owner codes', () => {
  const ALLAN = 'a11a11a11a11';
  const KENZIE = 'c0ffeec0ffee';
  const FORGER = 'bad0bad0bad0';
  const LONDON_GEAR = ['T4L Gusset', 'T4E Chalice'];
  /** Kenzie's plan, sent with her code: 194 215 490 from TE 178 on 20 Sep, gaining 1 TE a day. */
  const kenzie = (over: Partial<BoardRow> = {}) =>
    row({
      id: 'kenzie',
      nickname: 'Kenzie',
      acct: KENZIE,
      timezone: 'Europe/London',
      window: null,
      artifacts: LONDON_GEAR,
      currentTE: 178,
      chain: [194, 215, 490],
      startLocal: '2026-09-20 10:00',
      submittedAt: '2026-09-20T09:05:00Z',
      receivedAt: '2026-09-20T09:05:01Z',
      durationDays: 700,
      legs: [
        { te: 194, days: 16 },
        { te: 215, days: 21 },
        { te: 490, days: 663 },
      ],
      ...over,
    });
  const judged = (rows: BoardRow[]) =>
    Object.fromEntries(
      groupPlayers(rows, { target: 490, now: NOW }).flatMap(p => p.plans.map(x => [x.row.id, x.state]))
    );

  it('is the player, whatever name the runs were sent under, and the line takes the newest name', () => {
    const first = row({ id: 'first', acct: ALLAN, nickname: 'Allan', receivedAt: '2026-09-24T20:00:00Z' });
    const renamed = row({
      id: 'renamed',
      acct: ALLAN,
      nickname: 'allanfieldhouse',
      chain: [230, 490],
      durationDays: 680,
      startLocal: '2026-09-25 15:00',
      submittedAt: '2026-09-25T20:05:00Z',
      receivedAt: '2026-09-25T20:05:01Z',
      legs: [],
    });
    const race = buildRace([first, renamed], { target: 490, now: NOW });
    expect(race.entries.map(e => [e.key, e.label, e.plansTried])).toEqual([[`acct:${ALLAN}`, 'allanfieldhouse', 2]]);
  });

  it("never lets rows dressed as another player's knock their plan out", () => {
    // Every field phase 1 matched on is public: name, timezone, artifacts. Four forged rows, sent
    // after her plan: the same plan finishing a year later (a "re-measure"), a run 20 TE behind her
    // plan, and a run from a lower TE that would make her plan a what-if -- under her name with
    // another code, and anonymously.
    const later = {
      startLocal: '2026-09-25 10:00',
      submittedAt: '2026-09-25T09:05:00Z',
      receivedAt: '2026-09-25T09:05:01Z',
    };
    const forged = [
      kenzie({ id: 'remeasure', acct: FORGER, durationDays: 1100, ...later }),
      kenzie({ id: 'behind', acct: FORGER, currentTE: 163, chain: [200, 490], ...later }),
      kenzie({ id: 'anonLow', acct: undefined, nickname: undefined, currentTE: 150, chain: [170, 490], ...later }),
      kenzie({ id: 'anonSame', acct: undefined, nickname: undefined, durationDays: 1100, ...later }),
    ];
    const race = buildRace([kenzie(), ...forged], { target: 490, now: NOW });
    const real = race.entries.find(e => e.key === `acct:${KENZIE}`)!;
    expect(real.best.row.id).toBe('kenzie');
    expect(real.dropped).toEqual([]);
    expect(real.best.recheck).toBeNull();
    // The same rows with no owner codes anywhere -- phase 1 -- did knock it out.
    const phase1 = [kenzie(), ...forged].map(r => ({ ...r, acct: undefined }));
    expect(judged(phase1).kenzie).not.toBe('current');
  });

  it("lets the owner's own newer run replace the plan, even under a new name", () => {
    const again = kenzie({
      id: 'again',
      nickname: 'Kenzie (re-run)',
      currentTE: 183,
      chain: [194, 215, 490],
      startLocal: '2026-09-25 10:00',
      submittedAt: '2026-09-25T09:05:00Z',
      receivedAt: '2026-09-25T09:05:01Z',
      durationDays: 696,
    });
    const k = buildRace([kenzie(), again], { target: 490, now: NOW }).entries[0];
    expect(k.best.row.id).toBe('again');
    expect(k.best.recheck?.count).toBe(2);
    expect(k.best.earlier.map(p => p.row.id)).toEqual(['kenzie']);
  });

  it('files runs from before owner codes on the first owner seen with the name, judged among themselves', () => {
    const legacy = row({ id: 'legacy', startLocal: '2026-09-22 13:52', submittedAt: '2026-09-22T19:00:00Z' });
    const legacyAgain = row({ id: 'legacyAgain', startLocal: '2026-09-23 13:52', submittedAt: '2026-09-23T19:00:00Z' });
    const owned = row({
      id: 'owned',
      acct: ALLAN,
      chain: [230, 490],
      durationDays: 690,
      receivedAt: '2026-09-25T20:02:00Z',
      legs: [],
    });
    const ownedSame = row({ id: 'ownedSame', acct: ALLAN, receivedAt: '2026-09-25T20:03:00Z' });
    const race = buildRace([legacy, legacyAgain, owned, ownedSame], { target: 490, now: NOW });
    // One line, not two lines called allanfieldhouse.
    expect(race.entries.map(e => [e.key, e.label])).toEqual([[`acct:${ALLAN}`, 'allanfieldhouse']]);
    const states = judged([legacy, legacyAgain, owned, ownedSame]);
    // Old rows still re-check each other; a row with a code does not judge one without (anyone
    // could have used the name before its owner did).
    expect(states).toEqual({ legacy: 'replaced', legacyAgain: 'current', owned: 'current', ownedSame: 'current' });
  });

  it('uses the collector stamp, not the sender clock, for a what-if start', () => {
    const dressed = kenzie({
      id: 'dressed',
      startLocal: '2026-11-23 10:00',
      submittedAt: '2026-11-23T09:30:00Z', // the sender's clock, set next to the start
      receivedAt: '2026-09-25T09:30:00Z', // when it really arrived
    });
    expect(judged([dressed]).dressed).toBe('what-if');
    expect(judged([{ ...dressed, receivedAt: undefined }]).dressed).toBe('current');
  });

  it('reads the start from startUtc when the row has it', () => {
    // 01:30 on 1 Nov happens twice in Chicago. The row says which.
    const r = row({ startLocal: '2026-11-01 01:30', startUtc: '2026-11-01T07:30:00.000Z', durationDays: 600 });
    expect(finishMs(r)).toBe(Date.parse('2026-11-01T07:30:00Z') + 600 * DAY_MS);
    expect(finishMs({ ...r, startUtc: 'garbage' })).toBe(localToUtcMs('2026-11-01 01:30', CHICAGO)! + 600 * DAY_MS);
  });

  it('drops a schema-7 plan that says it starts before its save, or above the save TE', () => {
    const early = kenzie({ id: 'early', schema: 7, backupAgeHours: -30 });
    const high = kenzie({ id: 'high', schema: 7, backupTE: 170, chain: [196, 490] });
    const fine = kenzie({ id: 'fine', schema: 7, backupAgeHours: -0.05, backupTE: 178, chain: [195, 490] });
    const plans = groupPlayers([early, high, fine], { target: 490, now: NOW })[0].plans;
    expect(Object.fromEntries(plans.map(p => [p.row.id, [p.state, p.reason]]))).toEqual({
      early: ['what-if', 'what-if: planned to start 30 h before the save it was made from'],
      high: ['what-if', 'what-if: planned from TE 178, the save it was made from is at TE 170'],
      fine: ['current', ''],
    });
  });

  // Review, 2026-09-26: `heirs` filed EVERY code-less row under an owner's name on the owner's line,
  // so a stranger's copy of Allan's public row, re-posted with no code under his name, counted as his
  // own copy, stood for his line with its bigger search, took his `acct`, and then judged his plans.
  it("never lets a code-less copy under an owner's name stand for, badge or judge their line", () => {
    const plan = row({ id: 'plan', acct: ALLAN, chainsPriced: 400, receivedAt: '2026-09-25T20:02:00Z' });
    const older = row({
      id: 'older',
      acct: ALLAN,
      chain: [230, 260, 297, 490],
      startLocal: '2026-09-23 13:52',
      submittedAt: '2026-09-23T19:00:00Z',
      receivedAt: '2026-09-23T19:00:01Z',
      durationDays: 668,
      legs: [],
    });
    // Copied from /all and POSTed to /submit with no x-owner-token, keeping his name.
    const copy = (over: Partial<BoardRow>) =>
      row({
        ...plan,
        id: 'forged',
        acct: undefined,
        receivedAt: '2026-09-26T01:00:00Z',
        chainsPriced: 999999,
        schema: 7,
        ...over,
      });
    const variants: Record<string, BoardRow> = {
      'a what-if by its own save TE': copy({ backupTE: 0 }),
      'a start a year on': copy({ startUtc: '2027-09-25T18:52:00.000Z' }),
      'a re-check of his older plan': copy({ rechecks: [{ chain: [230, 260, 297, 490], days: 5000 }] }),
      'an exhaustive badge': copy({
        space: {
          mode: 'range',
          range: { lo: 200, hi: 480, step: 1 },
          minGap: 0,
          minAscensions: 1,
          maxAscensions: 5,
          chains: 9e9,
          chainsPriced: 9e9,
          stoppedEarly: false,
        },
      }),
    };
    for (const [what, forged] of Object.entries(variants)) {
      const race = buildRace([plan, older, forged], { target: 490, now: NOW });
      const allan = race.entries.find(e => e.key === `acct:${ALLAN}`);
      expect(allan, what).toBeDefined();
      // His own plans, judged by his own runs alone: the copy changed none of them.
      expect(
        allan!.plans.filter(p => !allan!.noCode?.has(p)).map(p => [p.row.id, p.state]),
        what
      ).toEqual([
        ['plan', 'current'],
        ['older', 'current'],
      ]);
      expect(allan!.best.row.id, what).toBe('plan');
      expect(allan!.best.row.space, what).toBeUndefined();
      expect(
        allan!.best.folded.copies.map(c => c.id),
        what
      ).toEqual(['plan']);
      // Its gear and TE fit his, so the copy is listed on his line, marked as not carrying his code,
      // rather than as a second line under his name -- and it is never his best.
      const copy = allan!.plans.find(p => p.row.id === 'forged')!;
      expect(allan!.noCode?.has(copy), what).toBe(true);
      expect(browserTag(allan!, copy), what).toBe('no code');
      expect(allan!.lines, what).toEqual([`acct:${ALLAN}`, 'name:allanfieldhouse']);
      expect(race.entries.length + race.waiting.length, what).toBe(1);
      // From other gear it does not fit: a line of its own under the bare name, as before.
      const elsewhere = { ...forged, artifacts: ['T2C Gusset'] };
      const apart = buildRace([plan, older, elsewhere], { target: 490, now: NOW });
      const other = [...apart.entries, ...apart.waiting].find(e => e.key === 'name:allanfieldhouse');
      expect(other?.label, what).toBe('allanfieldhouse (no code)');
      expect(apart.entries.find(e => e.key === `acct:${ALLAN}`)!.noCode, what).toBeUndefined();
    }
    // Before the fix all four knocked him out or re-labelled his line; the filing is what changed.
    expect(playerKey(fileRows([plan, variants['an exhaustive badge']]), variants['an exhaustive badge'])).toBe(
      'name:allanfieldhouse'
    );
  });

  it('never lets a stranger reach an owner line through a legacy row the collector linked it to', () => {
    // A pre-stamp anonymous copy of Kenzie's result, her own copy, and a stranger's anonymous re-post
    // with a huge search. The collector's code-less rule ("no code, same nickname") pointed the
    // stranger's copy at the legacy row -- which proves nothing about who sent it.
    const legacyAnon = kenzie({ id: 'legacyAnon', acct: undefined, nickname: undefined, receivedAt: undefined });
    const mine = kenzie({ id: 'mine', chainsPriced: 400 });
    const stranger = kenzie({
      id: 'stranger',
      acct: undefined,
      nickname: undefined,
      receivedAt: '2026-09-21T00:00:00Z',
      dupOf: 'legacyAnon',
      chainsPriced: 999999,
      backupAgeHours: -30,
    });
    const [line] = foldCopies([legacyAnon, mine, stranger]);
    expect(line.copies.map(c => c.id)).toEqual(['legacyAnon', 'mine', 'stranger']);
    expect(line.row.id).not.toBe('stranger');
    expect(line.row).toMatchObject({ nickname: 'Kenzie', acct: KENZIE });
    expect(buildRace([legacyAnon, mine, stranger], { target: 490, now: NOW }).entries[0].best.state).toBe('current');
  });

  it('folds a stranger re-posting a result without letting the copy speak for the line', () => {
    const mine = kenzie({ id: 'mine', chainsPriced: 400, hasCsv: false });
    // Posted after hers, anonymously, with no tie to her: someone else's copy of a public row.
    const stranger = kenzie({
      id: 'stranger',
      acct: undefined,
      nickname: undefined,
      chainsPriced: 999999,
      hasCsv: true,
      receivedAt: '2026-09-21T00:00:00Z',
    });
    const [line] = foldCopies([mine, stranger]);
    expect(line.copies.map(c => c.id)).toEqual(['mine', 'stranger']);
    expect(line.row.id).toBe('mine');
    // Her own bigger search of the same result, tied to hers by the collector, does stand for it.
    const thorough = { ...stranger, id: 'thorough', dupOf: 'mine' };
    expect(foldCopies([mine, thorough])[0].row).toMatchObject({ id: 'thorough', nickname: 'Kenzie', acct: KENZIE });
  });
});

describe('phase 2: rechecks', () => {
  const ALLAN = 'a11a11a11a11';
  // 23 Sep: 225 255 290 328 490. 25 Sep: a different route, and the 23 Sep plan priced again from
  // the 25 Sep save -- a day later than it first said.
  const plan = row({
    id: 'plan',
    acct: ALLAN,
    startLocal: '2026-09-23 13:52',
    submittedAt: '2026-09-23T19:00:00Z',
    durationDays: 665.2713,
  });
  const planFinish = finishMs(plan)!;
  const start25 = Date.parse('2026-09-25T18:52:00Z');
  const newer = (over: Partial<BoardRow> = {}) =>
    row({
      id: 'newer',
      acct: ALLAN,
      chain: [230, 260, 297, 490],
      durationDays: 670,
      legs: [],
      rechecks: [{ chain: [225, 255, 290, 328, 490], days: (planFinish + DAY_MS - start25) / DAY_MS }],
      ...over,
    });

  it('replaces the older plan with its re-measure, and says it moved', () => {
    const allan = buildRace([plan, newer()], { target: 490, now: NOW }).entries[0];
    expect(allan.best.row.recheckOf).toBe('newer');
    expect(allan.best.row.chain).toEqual([225, 255, 290, 328, 490]);
    expect(allan.best.finish! - planFinish).toBeCloseTo(DAY_MS, -3);
    expect(allan.best.recheck).toMatchObject({ count: 2, unchanged: false });
    expect(allan.best.earlier.map(p => [p.row.id, p.reason])).toEqual([
      ['plan', expect.stringMatching(/^re-checked by a newer run \(25 \w+\)/)],
    ]);
    expect(allan.others.map(p => p.row.id)).toEqual(['newer']);
    // Two runs sent, two plans; the re-measure is neither a send nor a plan of its own.
    expect([allan.sends, allan.plansTried]).toEqual([2, 2]);
  });

  it('is ignored from another owner, and when it matches no older plan', () => {
    const forged = newer({ acct: 'bad0bad0bad0' });
    const race = buildRace([plan, forged], { target: 490, now: NOW });
    expect(race.entries.find(e => e.key === `acct:${ALLAN}`)!.best.row.id).toBe('plan');
    // A stranger re-posting her newer run anonymously, word for word, with rechecks of their own.
    const repost = newer({
      id: 'repost',
      acct: undefined,
      nickname: undefined,
      receivedAt: '2026-09-26T01:00:00Z',
      rechecks: [{ chain: [225, 255, 290, 328, 490], days: 900 }],
    });
    const withRepost = buildRace([plan, newer({ rechecks: undefined }), repost], { target: 490, now: NOW });
    expect(withRepost.entries[0].best.row.id).toBe('plan');
    const stray = newer({ rechecks: [{ chain: [240, 490], days: 700 }] });
    const allan = buildRace([plan, stray], { target: 490, now: NOW }).entries[0];
    expect(allan.plans.map(p => p.row.id).sort()).toEqual(['newer', 'plan']);
  });
});

describe('phase 2: my plans from GET /mine', () => {
  const ALLAN = 'a11a11a11a11';
  const named = row({
    id: 'named',
    acct: ALLAN,
    yours: true,
    startLocal: '2026-09-24 13:52',
    submittedAt: '2026-09-24T19:00:00Z',
    durationDays: 664.2713,
  });
  const anonAgain = row({ id: 'anonAgain', nickname: undefined, yours: true, receivedAt: '2026-09-25T20:00:00Z' });

  it('counts an anonymous re-run sent with the same code as a re-check, which the public race cannot', () => {
    const mine = buildMyPlans([named, anonAgain], null, { target: 490, now: NOW })!;
    expect(mine.best!.row.id).toBe('anonAgain');
    expect(mine.best!.recheck?.count).toBe(2);
    const race = buildRace(
      [named, anonAgain].map(r => ({ ...r, yours: undefined })),
      { target: 490, now: NOW }
    );
    expect(race.entries[0].best.row.id).toBe('named');
  });

  it("lists a look-alike from another browser without letting it judge the viewer's plans", () => {
    const other = row({
      id: 'other',
      acct: 'bad0bad0bad0',
      chain: [230, 490],
      receivedAt: '2026-09-25T21:00:00Z',
      durationDays: 690,
      legs: [],
    });
    const mine = buildMyPlans([named, other], accountKeyOf(named), { target: 490, now: NOW })!;
    expect(mine.plans.map(p => [p.row.id, p.state])).toEqual([
      ['named', 'current'],
      ['other', 'current'],
    ]);
    // Without a save loaded, only what the collector confirmed.
    expect(buildMyPlans([named, other], null, { target: 490, now: NOW })!.plans.map(p => p.row.id)).toEqual(['named']);
  });

  it('never ranks a flagged run that came back through /mine', () => {
    const flagged = row({ id: 'flagged', yours: true, acct: ALLAN, flags: ['decades-long'], durationDays: 5000 });
    expect(buildMyPlans([flagged], null, { target: 490, now: NOW })).toBeNull();
  });
});

describe('one player on two browsers', () => {
  // Allan's pattern on the live board (2026-09-26): an owner code is kept per browser, so his runs
  // came in under two codes, interleaved, with the same name, timezone and artifacts and TE 198 -> 199.
  // The first code also holds his runs from before the collector stamped rows.
  const B1 = 'a11a11a11a11';
  const B2 = 'a22a22a22a22';
  const FORGER = 'bad0bad0bad0';
  const F = Date.parse('2028-07-19T16:00:00Z');
  /** An Allan run from `startLocal` (Chicago) that finishes at `finish`. */
  const run = (id: string, startLocal: string, sent: string, te: number, chain: number[], finish: number, over = {}) =>
    row({
      id,
      startLocal,
      submittedAt: sent,
      currentTE: te,
      chain,
      durationDays: (finish - localToUtcMs(startLocal, CHICAGO)!) / DAY_MS,
      legs: [],
      ...over,
    });
  const SIX = [199, 223, 253, 282, 316, 490];
  const SEVEN = [200, 225, 251, 279, 295, 324, 490];
  // Sent before owner codes, so filed on the first code's line.
  const legacy = run('legacy', '2026-09-23 10:46', '2026-09-23T15:50:00Z', 198, SIX, F + 0.6 * DAY_MS);
  const b1a = run('b1a', '2026-09-24 11:40', '2026-09-24T16:46:00Z', 198, SEVEN, F, { acct: B1 });
  const b2a = run('b2a', '2026-09-24 12:15', '2026-09-24T17:19:00Z', 198, [230, 260, 297, 490], F + 1.9 * DAY_MS, {
    acct: B2,
  });
  // The legacy six-ascension plan with its first checkpoint passed, sent with the first code.
  const b1b = run('b1b', '2026-09-25 11:43', '2026-09-25T16:45:00Z', 199, SIX.slice(1), F + 0.6 * DAY_MS + 7000, {
    acct: B1,
  });
  // The first browser's best plan, run again from the second browser.
  const b2c = run('b2c', '2026-09-25 13:52', '2026-09-25T18:55:00Z', 199, SEVEN, F + 0.3 * DAY_MS, { acct: B2 });
  const b2b = run('b2b', '2026-09-25 15:00', '2026-09-25T20:02:00Z', 199, [283, 490], F + 40 * DAY_MS, { acct: B2 });
  const allan = [legacy, b1a, b2a, b1b, b2c, b2b];
  const opts = { target: 490, now: NOW };

  it('is one place in the race, and everyone after him moves up', () => {
    const race = buildRace([...allan, rival('Kenzie', 700)], opts);
    expect(race.entries.map(e => [e.rank, e.label])).toEqual([
      [1, 'allanfieldhouse'],
      [2, 'Kenzie'],
    ]);
    const a = race.entries[0];
    // The first code's key and name: the heir of his old rows, so a later code cannot re-key it.
    expect(a.key).toBe(`acct:${B1}`);
    expect(a.lines).toEqual([`acct:${B1}`, `acct:${B2}`]);
    expect(a.best.row.id).toBe('b1a');
    expect(a.sends).toBe(6);
    // Where a viewer on the second browser would place is counted against 1 other player, not 2.
    expect(placeFor(race, F + 0.1 * DAY_MS, a.key)).toBe(1);
    expect(browserTag(a, a.best)).toBe('browser 1');
    expect(browserTag(a, a.plans.find(p => p.row.id === 'b2c')!)).toBe('browser 2');
    // Sent before owner codes existed, and filed as his: not "no code", which means "may be anybody's".
    expect(browserTag(a, a.plans.find(p => p.row.id === 'legacy')!)).toBe('before codes');
    expect(browserTag(race.entries[1], race.entries[1].best)).toBe('');
  });

  it("judges each browser's plans by that browser's runs alone, and lists the same plan once", () => {
    const a = buildRace(allan, opts).entries[0];
    // b2c is a newer run of b1a's plan, and b1b of the legacy plan, but neither may judge the other:
    // another code, or no code. So every plan still counts as judged ...
    expect(Object.fromEntries(a.plans.map(p => [p.row.id, p.state]))).toEqual({
      legacy: 'current',
      b1a: 'current',
      b2a: 'current',
      b1b: 'current',
      b2c: 'current',
      b2b: 'current',
    });
    // ... and each plan is listed and counted once: the best stays listed, otherwise the newest run
    // stands for the pair.
    expect(a.listed.map(p => p.row.id)).toEqual(['b1b', 'b2a', 'b2b']);
    expect([...a.resends].map(([p, under]) => [p.row.id, under.map(u => u.row.id)])).toEqual([
      ['b1a', ['b2c']],
      ['b1b', ['legacy']],
    ]);
    expect(a.plansTried).toBe(4);
    // The per-code lines the Explorer reads are untouched.
    const lines = groupPlayers(allan, opts).filter(p => p.key.startsWith('acct:'));
    expect(lines.map(p => [p.key, p.plansTried]).sort()).toEqual([
      [`acct:${B1}`, 2],
      [`acct:${B2}`, 3],
    ]);
    // Sent from the first browser, the same re-run would have replaced the plan.
    const one = buildRace([...allan.filter(r => r !== b2c), { ...b2c, acct: B1 }], opts).entries[0];
    expect(one.plans.find(p => p.row.id === 'b1a')!.state).toBe('replaced');
  });

  it('keeps apart a second code under the name whose runs do not fit, and never shows two lines the same', () => {
    // A code of its own, dressed in his name, timezone and artifacts, from TE 150 after his TE 199 runs.
    const forged = run('forged', '2026-09-25 18:00', '2026-09-25T23:05:00Z', 150, [170, 490], F - 5 * DAY_MS, {
      acct: FORGER,
    });
    const race = buildRace([...allan, forged], opts);
    expect(race.entries.map(e => [e.rank, e.key, e.label])).toEqual([
      [1, `acct:${FORGER}`, 'allanfieldhouse (other code)'],
      [2, `acct:${B1}`, 'allanfieldhouse'],
    ]);
    expect(race.entries[1].lines).toEqual([`acct:${B1}`, `acct:${B2}`]);
    // Nor the other way round: a code sent last, with a run from before his at a TE far above them.
    const above = run('above', '2026-09-22 10:00', '2026-09-25T23:30:00Z', 260, [300, 490], F + 9 * DAY_MS, {
      acct: FORGER,
    });
    expect(buildRace([...allan, above], opts).entries.map(e => [e.label, e.lines.length])).toEqual([
      ['allanfieldhouse', 2],
      ['allanfieldhouse (other code)', 1],
    ]);
    // The name stays with the code first seen under it at any target, even when the other code sent to
    // this target first.
    const to300 = run('to300', '2026-09-20 10:00', '2026-09-20T15:05:00Z', 197, [250, 300], F - 400 * DAY_MS, {
      acct: B1,
      finalTE: 300,
    });
    const early = run('early', '2026-09-21 10:00', '2026-09-21T15:05:00Z', 150, [170, 490], F + 50 * DAY_MS, {
      acct: FORGER,
    });
    expect(
      buildRace([to300, early, ...allan], opts)
        .entries.map(e => [e.key, e.label])
        .sort()
    ).toEqual([
      [`acct:${B1}`, 'allanfieldhouse'],
      [`acct:${FORGER}`, 'allanfieldhouse (other code)'],
    ]);
    // Another account under the same name (other artifacts) is another player.
    const k1 = rival('Kenzie', 700, { acct: 'c0ffeec0ffee' });
    const k2 = rival('Kenzie', 710, {
      acct: 'c1ffeec1ffee',
      artifacts: ['T2C Gusset'],
      submittedAt: new Date(NOW - DAY_MS).toISOString(),
    });
    expect(buildRace([k1, k2], opts).entries.map(e => e.label)).toEqual(['Kenzie', 'Kenzie (other code)']);
  });

  it('joins a look-alike that copies everything, but it can neither drop a plan nor rename the line', () => {
    // Every field the join reads is public. A stranger with their own code, the same name, gear and
    // TE, sends his best plan finishing 300 days later.
    const lookAlike = run('lookAlike', '2026-09-25 17:30', '2026-09-25T22:35:00Z', 199, SEVEN, F + 300 * DAY_MS, {
      acct: FORGER,
      nickname: 'AllanFieldhouse',
    });
    const a = buildRace([...allan, lookAlike], opts).entries[0];
    expect([a.key, a.label, a.lines.length]).toEqual([`acct:${B1}`, 'allanfieldhouse', 3]);
    expect(a.best.row.id).toBe('b1a');
    expect(a.plans.find(p => p.row.id === 'b1a')!.state).toBe('current');
    // Its copy of his best plan finishes 300 days later: two answers, listed apart, not one plan.
    expect(a.resends.get(a.best)!.map(p => p.row.id)).toEqual(['b2c']);
    expect(a.listed.map(p => p.row.id)).toContain('lookAlike');
  });

  it('counts two sends of one plan minutes apart once', () => {
    // (icon)'s 274 490, sent at 16:14 and again at 16:18: under an hour apart, so neither replaces the
    // other, and both stand.
    const at = (id: string, startLocal: string, finishDays: number) =>
      rival('\ue001\ue002', 0, {
        id,
        acct: 'feedfeedfeed',
        timezone: 'America/Los_Angeles',
        chain: [274, 490],
        startLocal,
        submittedAt: `${startLocal.replace(' ', 'T')}:30-07:00`,
        durationDays: finishDays,
      });
    const e = buildRace([at('first', '2026-09-23 16:14', 766.2), at('again', '2026-09-23 16:18', 766.4)], opts)
      .entries[0];
    expect(e.label).toBe('(icon) · Los Angeles');
    expect(e.plans.map(p => p.state)).toEqual(['current', 'current']);
    expect(e.best.row.id).toBe('first');
    expect(e.listed).toEqual([]);
    expect(e.resends.get(e.best)!.map(p => p.row.id)).toEqual(['again']);
    expect([e.plansTried, e.sends]).toEqual([1, 2]);
  });
});

describe('planner builds', () => {
  it('compares finishes only between plans priced by the same build of the planner', () => {
    const key = accountKeyOf(row());
    const best = row({ id: 'best', build: 'b1' });
    const same = row({ id: 'same', chain: [230, 260, 297, 490], durationDays: 663.6613, build: 'b1' });
    const other = row({ id: 'other', chain: [230, 490], durationDays: 670, legs: [], build: 'b2' });
    const unstamped = row({ id: 'unstamped', chain: [240, 490], durationDays: 671, legs: [] });
    const mine = buildMyPlans([best, same, other, unstamped], key, { target: 490, now: NOW })!;
    const byId = Object.fromEntries(mine.others.map(p => [p.row.id, p]));
    expect(gapToBest(byId.same, mine.best!)).toBeCloseTo(0.39, 6);
    // Same save, other build: the gap would be partly the planner.
    expect(sameSave(byId.other.row, best)).toBe(true);
    expect(gapToBest(byId.other, mine.best!)).toBeNull();
    // A row from before builds were sent is another build than one that says which it is.
    expect(sameBuild(unstamped, best)).toBe(false);
    expect(gapToBest(byId.unstamped, mine.best!)).toBeNull();
    expect(sameBuild(row(), row())).toBe(true);
  });
});

describe('schedule text', () => {
  it('drops the zone, which the full text in the tooltip keeps', () => {
    expect(scheduleText(WINDOW)).toBe('every day 07:00-23:00');
    expect(scheduleText('every day 06:00-22:00 America/Argentina/Buenos_Aires')).toBe('every day 06:00-22:00');
    expect(scheduleText('weekdays only')).toBe('weekdays only');
    expect(scheduleText(null)).toBe('any time');
    expect(scheduleText(undefined, 'no schedule')).toBe('no schedule');
  });
});

describe('a code-less line under an owner name', () => {
  // The live board on 2026-09-27: three sweeps posted at 16:16 UTC by a script under Williamthe5thc
  // with no owner code, from the same save as his own runs (plan start 24 Sep 08:49, TE 182, his
  // gear). They made a second race line, "Williamthe5thc (no code)", that took a place of its own.
  const DENVER = 'America/Denver';
  const W_GEAR = ['T4L Quantum metronome', 'T4E Interstellar compass', 'T4L Gusset', 'T4L The chalice'];
  const OWNER = 'da7ada7ada7a';
  const now = Date.parse('2026-09-27T21:00:00Z');
  const opts = { target: 490, now };
  /** A Williamthe5thc run: before owner codes unless `over` says otherwise. */
  const will = (id: string, chain: number[], durationDays: number, over: Partial<BoardRow> = {}) =>
    row({
      id,
      nickname: 'Williamthe5thc',
      timezone: DENVER,
      artifacts: W_GEAR,
      window: null,
      currentTE: 182,
      chain,
      durationDays,
      startLocal: '2026-09-24 08:49',
      submittedAt: '2026-09-24T15:27:05Z',
      backupAgeHours: undefined,
      legs: [],
      ...over,
    });
  const before = [
    will('b279', [279, 490], 850.3387),
    will('b303', [195, 227, 270, 303, 490], 727.4411, { submittedAt: '2026-09-25T22:26:02Z' }),
    will('b318', [195, 222, 248, 278, 318, 490], 724.642, { submittedAt: '2026-09-26T06:17:06Z' }),
    will('b321', [195, 216, 257, 289, 321, 490], 731.8586, {
      currentTE: 180,
      startLocal: '2026-09-17 21:21',
      submittedAt: '2026-09-18T18:25:32Z',
    }),
  ];
  // His one run sent with his code: 279 490 again, from the same save 2.3 h on.
  const owned = will('o279', [279, 490], 856.7845, {
    acct: OWNER,
    startLocal: '2026-09-24 11:06',
    submittedAt: '2026-09-24T17:15:11Z',
    backupAgeHours: 2.3,
  });
  const script = (id: string, chain: number[], durationDays: number, over: Partial<BoardRow> = {}) =>
    will(id, chain, durationDays, {
      submittedAt: '2026-09-27T16:16:47Z',
      receivedAt: '2026-09-27T16:19:21Z',
      ...over,
    });
  const sweeps = [
    script('s346', [195, 216, 240, 252, 272, 293, 346, 490], 726.9387),
    script('s352', [197, 221, 246, 261, 280, 291, 323, 352, 490], 728.7096),
    script('s320', [195, 222, 251, 273, 293, 320, 490], 726.8842),
  ];
  const kenzie = rival('Kenzie', 1000);
  const all = [...before, owned, ...sweeps, kenzie];

  it('is one race line: the sweeps are listed on his, tagged "no code" and counted in Tried', () => {
    const race = buildRace(all, opts);
    expect(race.entries.map(e => [e.rank, e.label])).toEqual([
      [1, 'Williamthe5thc'],
      [2, 'Kenzie'],
    ]);
    const w = race.entries[0];
    expect(w.key).toBe(`acct:${OWNER}`);
    expect(w.lines).toEqual([`acct:${OWNER}`, 'name:williamthe5thc']);
    expect([...w.noCode!].map(p => p.row.id).sort()).toEqual(['s320', 's346', 's352']);
    expect(w.best.row.id).toBe('b318');
    const tag = (id: string) => browserTag(w, w.plans.find(p => p.row.id === id)!);
    // Only the sweeps are marked: one browser, so nothing else needs telling apart.
    expect(['s346', 'b318', 'o279'].map(tag)).toEqual(['no code', '', '']);
    // Every plan once: four from before codes, his coded 279 490, and the three sweeps.
    expect([w.plansTried, w.sends]).toEqual([8, 8]);
    expect(w.listed.map(p => p.row.id)).toEqual(expect.arrayContaining(['s346', 's352', 's320']));
    // The Explorer's per-line judgement is untouched: the code-less line is still its own line there.
    const lines = groupPlayers(all, opts);
    expect(lines.find(p => p.key === 'name:williamthe5thc')?.label).toBe('Williamthe5thc (no code)');
    expect(
      lines
        .find(p => p.key === `acct:${OWNER}`)
        ?.plans.map(p => p.row.id)
        .sort()
    ).toEqual(['b279', 'b303', 'b318', 'b321', 'o279']);
  });

  it('never lets a code-less plan set his best or his place, however early it finishes', () => {
    const early = script('early', [190, 230, 490], 700);
    // Finishes after the code-less plan but before his own best.
    const between = rival('Between', 0, {
      durationDays:
        (finishMs(before[2])! - 12 * 3_600_000 - localToUtcMs(rival('x', 0).startLocal, 'Europe/London')!) / DAY_MS,
    });
    const race = buildRace([...all, early, between], opts);
    const w = race.entries.find(e => e.key === `acct:${OWNER}`)!;
    expect(w.best.row.id).toBe('b318');
    expect(race.entries.map(e => e.label)).toEqual(['Between', 'Williamthe5thc', 'Kenzie']);
    // Listed, and first by finish, but as one of his other plans.
    expect(w.others[0].row.id).toBe('early');
    expect(browserTag(w, w.others[0])).toBe('no code');
  });

  it('lists the same route twice when the two finishes are a week apart', () => {
    // b279 (before codes, 08:49) and o279 (his code, 11:06): neither may replace the other, and the
    // later start finishes 6.5 days later. Folded, the earlier finish was hidden under the later one.
    const w = buildRace(all, opts).entries[0];
    expect(w.resends.size).toBe(0);
    expect(w.listed.map(p => p.row.id)).toEqual(expect.arrayContaining(['b279', 'o279']));
    // And the two rows say how they differ.
    const tags = settingTags([before[0], owned], DENVER);
    expect([tags.get(before[0]), tags.get(owned)]).toEqual([['starts 08:49'], ['starts 11:06']]);
  });

  it('keeps apart a code-less line whose TE, gear or owner does not fit', () => {
    // A run from TE 150 sent after his TE 182 runs: not the same account's history.
    const low = script('low', [170, 490], 900, { currentTE: 150, startLocal: '2026-09-26 10:00' });
    const lowRace = buildRace([...before, owned, low], opts);
    expect(lowRace.entries.map(e => e.label).sort()).toEqual(['Williamthe5thc', 'Williamthe5thc (no code)']);
    // Another artifact set among them.
    const gear = script('gear', [200, 490], 800, { artifacts: ['T2C Gusset'] });
    const gearRace = buildRace([...before, owned, ...sweeps, gear], opts);
    expect(gearRace.entries.map(e => e.label).sort()).toEqual(['Williamthe5thc', 'Williamthe5thc (no code)']);
    // His own line has no plan that counts (all older than 30 days): folding would cost the sweeps their
    // place and gain nobody anything, so they keep their line.
    const later = { ...opts, now: Date.parse('2026-11-20T00:00:00Z') };
    const fresh = sweeps.map(r => ({ ...r, startLocal: '2026-11-19 08:49', receivedAt: '2026-11-19T16:19:21Z' }));
    const oldRace = buildRace([...before, owned, ...fresh], later);
    expect(oldRace.entries.map(e => e.label)).toEqual(['Williamthe5thc (no code)']);
    expect(oldRace.waiting.map(e => e.label)).toEqual(['Williamthe5thc']);
  });
});

describe('look-alike tags', () => {
  const LA = 'America/Los_Angeles';
  // (icon) · Los Angeles's 274 490, from one save seven hours old: 16:11 finishing the current run
  // first, 16:14 and 16:18 prestiging straight away.
  const icon = (id: string, startLocal: string, age: number, forceContinue: boolean) =>
    rival('', 0, {
      id,
      acct: 'feedfeedfeed',
      timezone: LA,
      chain: [274, 490],
      currentTE: 167,
      startLocal,
      backupAgeHours: age,
      forceContinue,
      durationDays: 881.5,
    });
  const a = icon('a', '2026-09-24 16:11', 6.8, true);
  const b = icon('b', '2026-09-24 16:14', 6.8, false);
  const c = icon('c', '2026-09-24 16:18', 6.9, false);

  it('groups plans of one route by save, not by the exact start minute', () => {
    const tags = settingTags([a, c]);
    expect([tags.get(a), tags.get(c)]).toEqual([['finishes current run first'], ['prestiges now']]);
  });

  it('says when each starts where the settings alone do not tell them apart, on the calendar asked for', () => {
    const tags = settingTags([a, b, c], 'America/Denver');
    expect([tags.get(a), tags.get(b), tags.get(c)]).toEqual([
      ['finishes current run first'],
      ['prestiges now', 'starts 17:14'],
      ['prestiges now', 'starts 17:18'],
    ]);
    expect(settingTags([b, c]).get(b)).toEqual(['starts 16:14']);
  });

  it('leaves alone plans from different saves or routes', () => {
    const otherSave = { ...c, id: 'd', startLocal: '2026-09-25 16:18', backupAgeHours: 0 };
    expect(settingTags([a, otherSave]).size).toBe(0);
    expect(settingTags([a, { ...b, chain: [275, 490] }]).size).toBe(0);
  });
});

describe('reason dates', () => {
  // A plan re-measured by a run that starts at 23:30 in Chicago on 24 Sep -- 25 Sep in London.
  const first = row({ id: 'first', startLocal: '2026-09-23 13:52', submittedAt: '2026-09-23T19:00:00Z' });
  const again = row({
    id: 'again',
    startLocal: '2026-09-24 23:30',
    submittedAt: '2026-09-25T04:40:00Z',
    durationDays: 662,
  });
  const reason = (zone?: string) =>
    groupPlayers([first, again], { target: 490, now: NOW, zone })[0].plans.find(p => p.row.id === 'first')!.reason;

  it("reads them in the run's own zone by default, and on the calendar a board passes", () => {
    expect(reason()).toBe('replaced by a newer run of the same plan (24 Sept)');
    expect(reason('Europe/London')).toBe('replaced by a newer run of the same plan (25 Sept)');
  });
});

describe('memoised identity and time', () => {
  /** The key as it was worked out before memoising. */
  const plainKey = (r: Pick<BoardRow, 'timezone' | 'artifacts'>) =>
    `${r.timezone ?? '?'}::${(r.artifacts ?? [])
      .map(a => (typeof a === 'string' ? a : (a?.label ?? '')))
      .sort()
      .join('|')}`;

  it('gives the same account key as before, for copies, other zones and a list that grew', () => {
    const gear = ['T4L Gusset', 'T3E Chalice', 'T4L Compass'];
    const cases: Pick<BoardRow, 'timezone' | 'artifacts'>[] = [
      { timezone: CHICAGO, artifacts: gear },
      { timezone: 'Europe/London', artifacts: gear },
      { timezone: undefined, artifacts: gear },
      { timezone: '', artifacts: gear },
      { timezone: CHICAGO, artifacts: undefined },
      { timezone: CHICAGO, artifacts: [...gear].reverse() },
      { timezone: CHICAGO, artifacts: [{ label: 'T4L Gusset', count: 1 }, 'T1 Feather'] },
    ];
    for (let pass = 0; pass < 3; pass++) {
      for (const c of cases) {
        expect(accountKeyOf(c)).toBe(plainKey(c));
        expect(accountKeyOf({ ...c })).toBe(plainKey(c));
      }
    }
    const grows = ['T4L Gusset'];
    const r = { timezone: CHICAGO, artifacts: grows };
    expect(accountKeyOf(r)).toBe(`${CHICAGO}::T4L Gusset`);
    grows.push('T1 Feather');
    expect(accountKeyOf(r)).toBe(`${CHICAGO}::T1 Feather|T4L Gusset`);
  });

  /** An offset worked out from scratch, as before memoising. */
  const formatters = new Map<string, Intl.DateTimeFormat | null>();
  function plainOffset(timezone: string, utcMs: number): number | null {
    if (!formatters.has(timezone)) {
      try {
        formatters.set(
          timezone,
          new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hourCycle: 'h23',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
          })
        );
      } catch {
        formatters.set(timezone, null);
      }
    }
    const f = formatters.get(timezone);
    if (!f) return null;
    const parts = f.formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    const offset = wall - Math.floor(utcMs / 1000) * 1000;
    return Number.isFinite(offset) ? offset : null;
  }
  function plainLocalToUtc(local: string, timezone: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(local);
    if (!m) return null;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    const first = plainOffset(timezone, wall);
    if (first == null) return null;
    let utc = wall - first;
    const second = plainOffset(timezone, utc);
    if (second == null) return null;
    if (second !== first) utc = wall - second;
    return utc;
  }

  it('reads every start and calendar day exactly as before, through clock changes on the half hour', () => {
    // St John's changes at 02:00 local (05:30 UTC); Lord Howe moves by 30 minutes; Kathmandu is +5:45.
    const zones = [
      'America/St_Johns',
      'Australia/Lord_Howe',
      'Asia/Kathmandu',
      'Europe/London',
      CHICAGO,
      'Pacific/Chatham',
      'Mars/Olympus_Mons',
    ];
    const days = ['2026-03-08', '2026-04-05', '2026-10-04', '2026-11-01', '2026-03-29', '2026-10-25', '2026-09-27'];
    const now = Date.parse('2026-09-27T12:00:00Z');
    for (const tz of zones) {
      for (const day of days) {
        for (let q = 0; q < 24 * 4; q++) {
          const local = `${day} ${String(Math.floor(q / 4)).padStart(2, '0')}:${String((q % 4) * 15 + 7).padStart(2, '0')}`;
          expect(localToUtcMs(local, tz), `${tz} ${local}`).toBe(plainLocalToUtc(local, tz));
          const at = Date.parse(`${day}T00:00:00Z`) + q * 15 * 60_000 + 7 * 60_000;
          const plainDays =
            Math.floor((at + (plainOffset(tz, at) ?? plainOffset('UTC', at)!)) / DAY_MS) -
            Math.floor((now + (plainOffset(tz, now) ?? 0)) / DAY_MS);
          expect(calendarDaysLeft(at, now, tz), `${tz} ${at}`).toBe(plainDays);
        }
      }
    }
  });
});
