import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  accountKeyOf,
  buildMyPlans,
  buildRace,
  daysLeft,
  daysLeftPhrase,
  daysLeftText,
  displayName,
  finishDateText,
  finishMs,
  foldCopies,
  gapToBest,
  groupPlayers,
  localToUtcMs,
  nameLabel,
  placeFor,
  projectedTE,
  remainingChain,
  samePlan,
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
