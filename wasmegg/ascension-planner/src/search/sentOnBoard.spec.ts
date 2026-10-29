/**
 * A result already on the Leaderboard, known on load (Jordan, 27 Oct 2026): By a date's share box offered
 * "Send 313 TE by this date" for a run already on the board, and only the press said "Already on the
 * Leaderboard (sent at 10:48 AM), nothing new stored". The account's own rows (GET /mine) carry what the
 * collector compares, so the app can tell before the press.
 */
import { describe, expect, it } from 'vitest';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { Submission } from './submission';
import { onBoardLine, sentRowFor } from './sentOnBoard';

const payload = {
  schema: 8,
  chain: [250, 280, 313],
  finalTE: 313,
  durationDays: 12.34567,
  startLocal: '2026-10-27 08:00',
  timezone: 'America/Chicago',
  artifacts: ['T4L Gusset', 'T4L Necklace'],
  currentTE: 240,
  window: '07:00-23:00',
  holdShifts: false,
  firstAscension: 'auto',
  timeOff: [],
  effort: 'deadline',
  chainsPriced: 1234,
  level: 'exhaustive',
  deadline: 1_793_000_000,
  deadlineAscendAt: 1_792_990_000,
} as unknown as Submission;

const row = (over: Partial<BoardRow> = {}): BoardRow =>
  ({
    ...(payload as unknown as BoardRow),
    id: 'row1',
    nickname: '',
    receivedAt: '2026-10-27T15:48:00Z',
    yours: true,
    ...over,
  }) as BoardRow;

describe('sentRowFor', () => {
  it('finds the row this browser sent with the same result and the same search', () => {
    expect(sentRowFor(payload, [row()])?.id).toBe('row1');
  });
  it('a name on the row or the send changes nothing: the collector compares results, not names', () => {
    expect(sentRowFor({ ...payload, nickname: 'Someone' }, [row()])?.id).toBe('row1');
  });
  it('only rows sent with this browser’s code (the collector folds only one sender’s copies)', () => {
    expect(sentRowFor(payload, [row({ yours: undefined })])).toBeNull();
  });
  it('another result is not it: route, time, start, deadline', () => {
    expect(sentRowFor(payload, [row({ chain: [250, 290, 313] })])).toBeNull();
    expect(sentRowFor(payload, [row({ durationDays: 12.4 })])).toBeNull();
    expect(sentRowFor(payload, [row({ startLocal: '2026-10-27 09:00' })])).toBeNull();
    expect(sentRowFor(payload, [row({ deadline: 1_793_100_000 })])).toBeNull();
  });
  it('the same answer from another search is stored as its own row: still offered', () => {
    expect(sentRowFor(payload, [row({ chainsPriced: 99 })])).toBeNull();
    expect(sentRowFor(payload, [row({ effort: 'exhaustive' })])).toBeNull();
  });
  it('a best so far is never the final', () => {
    expect(sentRowFor(payload, [row({ provisional: true })])).toBeNull();
  });
  it('no rows read (offline, no collector, no code): nothing known', () => {
    expect(sentRowFor(payload, null)).toBeNull();
    expect(sentRowFor(null, [row()])).toBeNull();
  });
});

describe('onBoardLine', () => {
  it('says when it was sent, as the press did', () => {
    const at = Date.parse('2026-10-27T15:48:00Z');
    expect(onBoardLine(row(), at + 3600_000)).toMatch(/^Already on the Leaderboard \(sent at .+\)$/);
  });
  it('without a time: just that it is there', () => {
    expect(onBoardLine(row({ receivedAt: undefined, submittedAt: undefined }))).toBe('Already on the Leaderboard');
  });
});
