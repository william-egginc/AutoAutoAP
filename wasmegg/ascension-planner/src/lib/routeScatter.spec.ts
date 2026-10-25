/** "Your routes at a glance" (lib/routeScatter.ts): points from the rows My runs already holds. */
import { describe, expect, it } from 'vitest';
import type { BoardRow } from './leaderboardRank';
import {
  LEVEL_COLOURS,
  SCATTER_CAP,
  ascTicks,
  buildScatter,
  dateTicks,
  defaultGoal,
  nearestPoint,
  niceTicks,
  pointLines,
  scatterNotes,
  scatterSummary,
  scatterView,
  whenText,
} from './routeScatter';

const EGG_DAY = 1_815_840_000;
const OTHER_DATE = 1_800_000_000;
const ZONE = 'UTC';

const race = (finalTE: number, chain: number[], days: number, extra: Partial<BoardRow> = {}): BoardRow => ({
  id: `r${finalTE}-${chain.join('-')}-${days}`,
  chain,
  finalTE,
  durationDays: days,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});
const dated = (
  deadline: number,
  te: number,
  chain: number[],
  spareH: number,
  extra: Partial<BoardRow> = {}
): BoardRow => ({
  id: `d${deadline}-${te}-${chain.join('-')}-${spareH}`,
  chain,
  finalTE: te,
  durationDays: 10,
  deadline,
  deadlineAscendAt: deadline - spareH * 3600,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-02T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});
const base = { eggDayAt: EGG_DAY, eggDayYear: 2027, zone: ZONE };

describe('buildScatter', () => {
  it('one goal per target or date, Egg Day first, then other dates, then races; colour key from the level', () => {
    const b = buildScatter({
      ...base,
      rows: [
        race(490, [200, 300, 490], 12.5, { level: 'normal', yours: true }),
        race(300, [150, 300], 4, { level: 'quick' }),
        dated(OTHER_DATE, 250, [100, 250], 5, { level: 'thorough' }),
        dated(EGG_DAY, 260, [100, 200, 260], 3),
      ],
    });
    expect(b.goals.map(g => g.label)).toEqual(['Egg Day 2027', 'By Jan 15', 'Fastest to 300 TE', 'Fastest to 490 TE']);
    const p = b.points.find(x => x.te === 490)!;
    expect(p).toMatchObject({ from: 'yours', level: 'normal', asc: 3, days: 12.5, spareHours: null });
    expect(p.finish).toBe(Date.parse('2026-10-01T00:00:00Z') + 12.5 * 86_400_000);
    expect(b.points.find(x => x.te === 300)!.from).toBe('maybe');
    expect(b.points.find(x => x.te === 260)!).toMatchObject({ level: 'unknown', spareHours: 3, days: null });
    expect(LEVEL_COLOURS.unknown).toMatch(/^#/);
  });

  it('copies of one result are one point; a date answer that misses its date is left out and counted', () => {
    const r = race(490, [300, 490], 10, { level: 'quick' });
    const b = buildScatter({
      ...base,
      rows: [r, { ...r, id: 'copy', submittedAt: '2026-10-03T00:00:00Z' }, dated(EGG_DAY, 270, [270], -2)],
    });
    expect(b.points).toHaveLength(1);
    expect(b.missed).toBe(1);
  });

  it('saved on this device: a run and an answer add points, unless the board already has that route', () => {
    const b = buildScatter({
      ...base,
      rows: [race(490, [300, 490], 10)],
      savedRuns: [
        { id: 'a', savedAt: 1, finalTE: 490, effort: 'thorough', bestChain: [300, 490], bestDays: 10 },
        { id: 'b', savedAt: 1, finalTE: 490, effort: 'thorough', bestChain: [250, 490], bestDays: 11 },
      ],
      savedAnswers: [
        {
          id: 'c',
          savedAt: 1,
          result: {
            deadline: EGG_DAY,
            level: 'light',
            routes: [{ chain: [150, 255], ascendAt: EGG_DAY - 7200, spare: 7200 }],
          },
        },
      ],
    });
    expect(b.points.map(p => [p.id, p.from, p.level])).toEqual([
      ['r490-300-490-10', 'maybe', 'unknown'],
      ['saved-b', 'saved', 'thorough'],
      ['answer-c', 'saved', 'light'],
    ]);
    expect(b.points[1].finish).toBeNull();
    expect(b.points[2]).toMatchObject({ te: 255, spareHours: 2, finish: (EGG_DAY - 7200) * 1000 });
  });

  it('nothing loaded: no goals', () => {
    expect(buildScatter({ ...base, rows: null })).toEqual({ goals: [], points: [], missed: 0 });
    expect(defaultGoal([])).toBeNull();
  });
});

describe('scatterView', () => {
  const rows = [
    race(490, [200, 300, 490], 12.5),
    race(490, [300, 490], 11),
    race(490, [250, 350, 420, 490], 11.8),
    race(300, [300], 3),
  ];
  const b = buildScatter({
    ...base,
    rows,
    savedRuns: [{ id: 's', savedAt: 1, finalTE: 490, effort: 'quick', bestChain: [100, 490], bestDays: 13 }],
  });

  it('the default goal is the one with the most points; a race is drawn in days whatever y asks', () => {
    expect(defaultGoal(b.goals)).toBe('race:490');
    const v = scatterView(b.goals, b.points, 'race:490', 'asc', 'spare');
    expect(v.y).toBe('days');
    expect(v.shown.map(p => p.days)).toEqual([11, 11.8, 12.5, 13]);
    expect(v.best!.days).toBe(11);
  });

  it('finish date across: a run saved here has none, so it is left out with a note', () => {
    const v = scatterView(b.goals, b.points, 'race:490', 'finish', 'te');
    expect(v.shown).toHaveLength(3);
    expect(v.noValue).toBe(1);
    expect(scatterNotes(v, 0)).toEqual([
      '1 saved on this computer has no finish date, so it is left out of this view.',
    ]);
  });

  it('a date goal: TE reached or hours to spare, best by TE then spare', () => {
    const d = buildScatter({
      ...base,
      rows: [
        dated(EGG_DAY, 250, [100, 250], 2),
        dated(EGG_DAY, 252, [120, 252], 1),
        dated(EGG_DAY, 252, [130, 252], 6),
      ],
    });
    const v = scatterView(d.goals, d.points, `date:${EGG_DAY}`, 'asc', 'spare');
    expect(v.y).toBe('spare');
    expect(v.best).toMatchObject({ te: 252, spareHours: 6 });
    expect(scatterSummary(v, ZONE)).toBe(
      '3 answers for Egg Day 2027. The best reaches TE 252 with 6.0 h to spare, in 2 ascensions. Across them: 2 ascensions, TE 250 to 252.'
    );
  });

  it('caps the points, keeping the best, and says so', () => {
    const many = Array.from({ length: 700 }, (_, k) => race(490, [k + 1, 490], 10 + k / 100));
    const m = buildScatter({ ...base, rows: many });
    const v = scatterView(m.goals, m.points, 'race:490', 'asc', 'te');
    expect(SCATTER_CAP).toBe(600);
    expect(v.shown).toHaveLength(600);
    expect(v.capped).toBe(100);
    expect(v.shown[599].days).toBeCloseTo(15.99);
    expect(scatterNotes(v, 0)[0]).toBe('Showing the best 600 of 700, to keep the page light.');
  });

  it('the race summary and the hover card, in plain words with 12-hour times', () => {
    const v = scatterView(b.goals, b.points, 'race:490', 'asc', 'te');
    expect(scatterSummary(v, ZONE)).toBe(
      '4 routes for Fastest to 490 TE. The best takes 11.0 days with 2 ascensions, finishing Oct 12 at 12:00 AM. Across them: 2 to 4 ascensions, 11.0 to 13.0 days.'
    );
    expect(pointLines(v.best!, v.goal!, ZONE, true)).toEqual([
      'Best · 300 → 490',
      '2 ascensions · 11.0 days · finishes Oct 12 at 12:00 AM',
      'Level not recorded · Maybe you',
    ]);
    const saved = v.shown.find(p => p.from === 'saved')!;
    expect(pointLines(saved, v.goal!, ZONE)).toEqual([
      '100 → 490',
      '2 ascensions · 13.0 days',
      'Fast · Saved on this computer',
    ]);
  });

  it('a date card says the TE, the spare and the last ascension', () => {
    const d = buildScatter({
      ...base,
      rows: [dated(OTHER_DATE, 250, [100, 250], 5, { level: 'exhaustive', yours: true })],
    });
    const v = scatterView(d.goals, d.points, d.goals[0].key, 'finish', 'te');
    expect(pointLines(v.best!, v.goal!, ZONE)).toEqual([
      '100 → 250',
      '2 ascensions · TE 250 · 5.0 h to spare',
      'Last ascension Jan 15 at 3:00 AM',
      'Custom · Sent from this browser',
    ]);
  });

  it('no goal: a plain sentence', () => {
    expect(scatterSummary(scatterView([], [], null, 'asc', 'te'), ZONE)).toBe('No routes of yours to show yet.');
  });
});

describe('axes', () => {
  it('round ticks, whole ascensions, day ticks', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(244.2, 251.7, 5)).toEqual([246, 248, 250]);
    expect(ascTicks(2, 5)).toEqual([2, 3, 4, 5]);
    const DAY = 86_400_000;
    expect(dateTicks(DAY * 10 + 5, DAY * 14)).toEqual([DAY * 11, DAY * 12, DAY * 13, DAY * 14]);
    expect(whenText(Date.parse('2026-10-21T14:40:00Z'), ZONE)).toBe('Oct 21 at 2:40 PM');
  });
});

describe('nearestPoint', () => {
  const pts = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 110, y: 100 },
    { id: 'c', x: 300, y: 200 },
  ];
  it('picks the closest of overlapping points, whatever the order', () => {
    expect(nearestPoint(pts, 108, 101, 22)?.id).toBe('b');
    expect(nearestPoint(pts, 102, 99, 22)?.id).toBe('a');
    expect(nearestPoint([...pts].reverse(), 102, 99, 22)?.id).toBe('a');
  });
  it('null when nothing is within reach, and on no points', () => {
    expect(nearestPoint(pts, 200, 150, 22)).toBeNull();
    expect(nearestPoint([], 1, 1, 22)).toBeNull();
  });
  it('reach is inclusive; a tie goes to the later (drawn on top) point', () => {
    expect(nearestPoint(pts, 322, 200, 22)?.id).toBe('c');
    expect(nearestPoint(pts, 105, 100, 22)?.id).toBe('b');
  });
});
