import { describe, expect, it } from 'vitest';
import type { BoardRow } from './leaderboardRank';
import type { NowPlan } from './nowPlan';
import { buildTile, howWords, rowLevel, rowSaveSeconds, type TileInput } from './savedTiles';

const NOW = Date.UTC(2026, 9, 15, 22, 0);
const SAVE = NOW / 1000 - 3 * 3600;
const DEADLINE = Date.UTC(2027, 6, 14, 16, 0) / 1000;

const plan = (o: Partial<NowPlan>): NowPlan => ({
  goal: 'date',
  deadline: DEADLINE,
  chain: [161, 198, 218, 248],
  end: DEADLINE - 16.8 * 3600,
  endTE: 248,
  legs: null,
  tableLegs: null,
  exact: true,
  instantTE: 248,
  calculatedAt: NOW - 2 * 3600_000,
  planStart: SAVE,
  spareHours: 16.8,
  runnerUpHours: 3,
  meta: null,
  whatIf: null,
  ...o,
});
const base = (o: Partial<TileInput>): TileInput => ({
  goal: 'date',
  target: 490,
  deadline: DEADLINE,
  nowMs: NOW,
  save: { seconds: SAVE, te: 186 },
  snapshot: null,
  lastChecked: null,
  history: [],
  board: null,
  saved: [],
  ...o,
});
const row = (o: Partial<BoardRow>): BoardRow => ({
  id: 'r',
  chain: [161, 198, 218, 248],
  finalTE: 248,
  durationDays: 270,
  timezone: 'UTC',
  deadline: DEADLINE,
  deadlineAscendAt: DEADLINE - 10 * 3600,
  submittedAt: new Date(NOW - 3600_000).toISOString(),
  startUtc: new Date(SAVE * 1000 + 3600_000).toISOString(),
  backupAgeHours: 1,
  backupTE: 186,
  level: 'quick',
  ...o,
});

describe('saved-answer tiles', () => {
  it('nothing worked out: no answer', () => {
    expect(buildTile(base({}))).toEqual({ goal: 'date', answer: null, olderSave: false, saveGapSeconds: null, sure: null });
  });

  it('a checked snapshot of this save: High when it confirms the TE with room', () => {
    const t = buildTile(base({ snapshot: plan({}) }));
    expect(t.answer?.source).toBe('snapshot');
    expect(t.answer?.calculatedAt).toBe(NOW - 2 * 3600_000);
    expect(t.answer?.saveSeconds).toBe(SAVE);
    expect(t.olderSave).toBe(false);
    expect(t.sure?.level).toBe('high');
    expect(howWords(t.answer!)).toBe('simulator check');
  });

  it('the table only: Medium, never High', () => {
    const t = buildTile(base({ snapshot: plan({ exact: false }) }));
    expect(t.sure).toMatchObject({ level: 'medium' });
    expect(howWords(t.answer!)).toBe('instant answer');
  });

  it('a search of the same save that agrees makes it High', () => {
    const t = buildTile(base({ snapshot: plan({ instantTE: 249, runnerUpHours: 1 }), board: [row({})] }));
    expect(t.sure?.level).toBe('high');
    expect(t.sure?.reason).toContain('Fast search agrees on 248 TE');
  });

  it('a better answer from a search of the same save heads the tile', () => {
    const t = buildTile(base({ snapshot: plan({}), board: [row({ finalTE: 249, chain: [161, 198, 218, 249] })] }));
    expect(t.answer?.endTE).toBe(249);
    expect(t.answer?.source).toBe('board');
  });

  it('only an older save’s answer: shown, flagged, and Low when the TE has moved', () => {
    const older = SAVE - 5 * 86400;
    const t = buildTile(
      base({
        history: [
          {
            at: older * 1000 + 600_000,
            backupTime: older,
            te: 180,
            mode: 'date',
            deadline: DEADLINE,
            instant: { chain: [200, 248], end: DEADLINE - 7200, endTE: 248 },
            // By a date a finished check always has its exact answer in time (exact null: none in time, eggDayRule).
            exact: { chain: [200, 248], end: DEADLINE - 7200, endTE: 248 },
            shared: false,
            sig: 's',
          },
        ],
      })
    );
    expect(t.answer?.source).toBe('history');
    expect(t.olderSave).toBe(true);
    expect(t.sure).toMatchObject({ level: 'low', reason: 'your TE has moved since' });
  });

  it('Fastest: the soonest, and board rows of the race only', () => {
    const t = buildTile(
      base({
        goal: 'fastest',
        deadline: null,
        lastChecked: { at: NOW - 3600_000, chain: [165, 200, 490], end: NOW / 1000 + 400 * 86400, endTE: 490 },
        board: [row({})],
      })
    );
    expect(t.answer?.source).toBe('lastChecked');
    expect(t.sure?.level).toBe('medium');
    expect(t.sure).not.toHaveProperty('action');
  });

  it('reads a board row’s level and save time', () => {
    expect(rowLevel(row({ space: { mode: 'range', minGap: 1, minAscensions: 1, maxAscensions: 9, chains: 1, chainsPriced: 1, stoppedEarly: false } }))).toBe('exhaustive');
    expect(rowLevel(row({ level: undefined, effort: 'normal' }))).toBe('normal');
    expect(rowSaveSeconds(row({}))).toBe(SAVE);
    expect(rowSaveSeconds(row({ backupAgeHours: undefined }))).toBeNull();
  });
});

describe('a newer save on the planned route (How sure, 22 Nov 2026)', () => {
  const T0 = SAVE - 10 * 86400;
  const DAY = 86400;
  const T1 = T0 + 3 * DAY;
  const old = plan({
    exact: false,
    calculatedAt: T0 * 1000,
    planStart: T0,
    chain: [161, 198],
    endTE: 198,
    tableLegs: [
      { from: 140, to: 161, endTE: 161, start: T0, end: T0 + 2 * DAY },
      { from: 161, to: 198, endTE: 198, start: T0 + 2 * DAY, end: T0 + 6 * DAY },
    ] as never,
    meta: { account: 'a', goal: 'g', backupTime: T0 } as never,
  });
  const at = (progress: number) =>
    base({
      nowMs: T1 * 1000 + 3600_000,
      snapshot: null,
      otherSnapshots: [{ plan: old, recorded: null }],
      save: { seconds: T1, te: Math.floor(progress), teByEgg: [progress, 0, 0, 0, 0], progress, onVirtue: true, egg: null },
    });
  it('on the plan (or behind it): confirmed, not Low for its age', () => {
    for (const p of [172, 165]) {
      const t = buildTile(at(p));
      expect(t.sure?.level).toBe('medium');
      expect(t.sure?.reason).toBe('your newer save is on the planned route');
    }
  });
  it('below where the plan began: off the route, a new search is needed', () => {
    const t = buildTile(at(120));
    expect(t.sure).toEqual({ level: 'low', reason: 'your newer save is off the planned route, so it needs a new search' });
  });
  it('no per-egg save progress given: the old rules', () => {
    const i = at(172);
    const t = buildTile({ ...i, save: { seconds: T1, te: 172 } });
    expect(t.sure?.reason).not.toContain('confirmed');
  });
});

