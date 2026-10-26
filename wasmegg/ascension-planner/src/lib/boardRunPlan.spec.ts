/**
 * A followed route from a run sent from another browser (26 Oct 2026, Williamthe5thc): the run's legs read back from its
 * CSV (written by search/csv.ts itself, then read by search/runLegsCsv.ts), matched to the followed route among the
 * account's Leaderboard rows (lib/boardRunPlan.ts), and priced as a kept result.
 */
import { describe, expect, it } from 'vitest';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { buildChainsCsv, buildDeadlineCsv } from '@/search/csv';
import { csvZone, legsFromRunCsv, unixFromZoned } from '@/search/runLegsCsv';
import { boardRunFor, rowFoundLevel, searchFromRun } from './boardRunPlan';
import { planFromSearch } from './searchPlan';
import { planEvents } from './nowPlan';
import type { BoardRow } from './leaderboardRank';
import type { LegSummary } from '@/search/types';

const DENVER = 'America/Denver';
const PLAN_START = getLocalTimestampInTimezone('2026-10-26', '12:00', DENVER);
const D = 86400;
const META = {
  planStart: PLAN_START,
  timezone: DENVER,
  currentTE: 195,
  final: 310,
  effort: 'quick',
  firstAscension: 'auto' as const,
  availability: null,
  seedChain: [197, 310],
  loadouts: [{ label: 'equipped in the backup', loadout: null }],
  generatedAt: PLAN_START * 1000,
};
const minute = (t: number) => Math.floor(t / 60) * 60;
const leg = (start: number, end: number, endTE: number, over: Partial<LegSummary> = {}): LegSummary => ({
  key: 'continue',
  endTE,
  durationSeconds: end - start,
  maxELR: 5.5e15 / 3600,
  endTime: end,
  tier13Unlocked: false,
  startTime: start,
  buildPhaseEndTime: start,
  shifts: [
    { at: start + 22 * 3600 + 44 * 60 + 17, egg: 'kindness', fromEgg: 'curiosity' },
    { at: start + 2 * D + 5, egg: 'humility', fromEgg: 'kindness' },
  ],
  ...over,
});
const LEGS = [
  leg(PLAN_START, PLAN_START + 2.5 * D, 196, { timeOff: 'stopped' }),
  leg(PLAN_START + 5 * D, PLAN_START + 9 * D, 197, { key: '1-sale', timeOff: 'restarted', buildPhaseEndTime: PLAN_START + 6 * D }),
  leg(PLAN_START + 9 * D, PLAN_START + 20 * D, 219, { key: '2-sale' }),
];
const EGG_DAY = PLAN_START + 150 * D;

describe('reading a run’s legs back from its CSV', () => {
  it('times to the minute in the run’s zone, shifts, strategy and the time-off cut (By a date’s CSV)', () => {
    const csv = buildDeadlineCsv(
      [{ chain: [197, 219], reachAt: PLAN_START + 20 * D, ascendAt: PLAN_START + 20 * D, spare: 130 * D, legs: LEGS }],
      META,
      { deadline: EGG_DAY, priced: 10 }
    );
    expect(csvZone(csv)).toBe(DENVER);
    const legs = legsFromRunCsv(csv, [197, 219])!;
    expect(legs.map(l => [l.key, l.endTE, l.timeOff ?? ''])).toEqual([
      ['continue', 196, 'stopped'],
      ['1-sale', 197, 'restarted'],
      ['2-sale', 219, ''],
    ]);
    LEGS.forEach((l, i) => {
      expect(legs[i].startTime).toBe(minute(l.startTime!));
      expect(legs[i].endTime).toBe(minute(l.endTime));
      expect(legs[i].shifts!.map(s => [s.at, s.egg])).toEqual(l.shifts!.map(s => [minute(s.at), s.egg]));
    });
    expect(legs[0].shifts![0].fromEgg).toBe('curiosity');
    expect(legs[1].buildPhaseEndTime).toBe(minute(PLAN_START + 6 * D));
    expect(legs[2].maxELR).toBeCloseTo(5.5e15 / 3600, -9);
  });

  it('the chain search’s CSV too; another route, a file without a zone, or a broken time: none', () => {
    const csv = buildChainsCsv([{ key: '197,219', seconds: 20 * D, legs: LEGS }], META);
    expect(legsFromRunCsv(csv, [197, 219])).toHaveLength(3);
    expect(legsFromRunCsv(csv, [198, 219])).toBeNull();
    expect(legsFromRunCsv(csv.replace(/^# generated .*$/m, '# x'), [197, 219])).toBeNull();
    expect(legsFromRunCsv(csv.replace(/2026-10-2\d \d\d:\d\d kindness/, 'soon kindness'), [197, 219])).toBeNull();
  });

  it('unixFromZoned is formatInZone backwards, DST included', () => {
    expect(unixFromZoned('2026-11-01 01:30', DENVER)).toBe(Date.parse('2026-11-01T07:30:00Z') / 1000);
    expect(unixFromZoned('2026-11-02 12:00', DENVER)).toBe(Date.parse('2026-11-02T19:00:00Z') / 1000);
    expect(unixFromZoned('nope', DENVER)).toBeNull();
  });
});

describe('the followed route’s run among the account’s rows', () => {
  const row = (over: Partial<BoardRow> = {}): BoardRow =>
    ({
      id: 'run-1',
      hasCsv: true,
      chain: [197, 219, 247, 278, 310],
      durationDays: 30,
      finalTE: 310,
      level: 'quick',
      deadline: EGG_DAY,
      startUtc: new Date(PLAN_START * 1000).toISOString(),
      backupAgeHours: 1,
      receivedAt: new Date((PLAN_START + 3600) * 1000).toISOString(),
      ...over,
    }) as BoardRow;
  const want = { goal: 'date' as const, target: 310, deadline: EGG_DAY, chain: [197, 219, 247, 278, 310], currentTE: 195 };

  it('the same route and goal, with a CSV; the newest of several', () => {
    expect(boardRunFor([row()], want)?.id).toBe('run-1');
    const newer = row({ id: 'run-2', receivedAt: new Date((PLAN_START + 7200) * 1000).toISOString() });
    expect(boardRunFor([row(), newer], want)?.id).toBe('run-2');
    // Passed stops don't matter (the route from the TE now).
    expect(boardRunFor([row({ chain: [190, 197, 219, 247, 278, 310] })], want)?.id).toBe('run-1');
  });

  it('never another route, goal, a run without a CSV, a provisional one, or one priced at once', () => {
    expect(boardRunFor([row({ chain: [198, 219, 247, 278, 310] })], want)).toBeNull();
    expect(boardRunFor([row({ deadline: EGG_DAY + D })], want)).toBeNull();
    expect(boardRunFor([row({ hasCsv: false })], want)).toBeNull();
    expect(boardRunFor([row({ provisional: true })], want)).toBeNull();
    expect(boardRunFor([row({ level: 'light' })], want)).toBeNull();
    expect(boardRunFor([row({ deadline: undefined })], { ...want, goal: 'fastest', deadline: null })?.id).toBe('run-1');
  });

  it('its legs make an exact plan: from your Fast run, sent from another browser, with every shift', () => {
    expect(rowFoundLevel(row())).toBe('Fast');
    expect(rowFoundLevel(row({ level: 'thorough' }))).toBe('Exact');
    const s = searchFromRun(row(), LEGS)!;
    expect(s).toMatchObject({ level: 'Fast', otherBrowser: true, planStart: PLAN_START, endTE: 219 });
    const p = planFromSearch(s, 'date', EGG_DAY, { meta: null, whatIf: null });
    expect(p).toMatchObject({ exact: true, from: { level: 'Fast', otherBrowser: true } });
    expect(planEvents(p, PLAN_START).filter(e => e.kind === 'shift')[0]).toMatchObject({ egg: 'kindness' });
    expect(searchFromRun(row(), null)).toBeNull();
  });
});
