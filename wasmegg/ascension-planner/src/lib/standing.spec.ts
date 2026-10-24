import { describe, expect, it } from 'vitest';
import type { BoardRow } from './leaderboardRank';
import { dateStanding, ordinal, raceStanding, standingWords } from './standing';

const NOW = Date.UTC(2026, 9, 15, 20, 0);
const DEADLINE = Date.UTC(2027, 6, 14, 16, 0) / 1000;
const sent = new Date(NOW - 3600_000).toISOString();

function dateRow(id: string, name: string | undefined, te: number, spareH: number, tz = 'America/Denver'): BoardRow {
  return {
    id,
    nickname: name,
    chain: [200, te],
    finalTE: te,
    durationDays: 200,
    timezone: tz,
    deadline: DEADLINE,
    deadlineAscendAt: DEADLINE - spareH * 3600,
    submittedAt: sent,
    receivedAt: sent,
    startUtc: new Date(NOW - 2 * 3600_000).toISOString(),
  };
}
function raceRow(id: string, name: string, days: number, tz = 'America/Denver'): BoardRow {
  return {
    id,
    nickname: name,
    chain: [200, 490],
    finalTE: 490,
    durationDays: days,
    timezone: tz,
    submittedAt: sent,
    receivedAt: sent,
    startUtc: new Date(NOW - 2 * 3600_000).toISOString(),
    currentTE: 186,
  };
}

const board = [
  dateRow('a', 'Ann', 250, 10, 'Europe/Paris'),
  dateRow('b', 'Bob', 248, 20, 'Asia/Tokyo'),
  dateRow('me', 'Me', 248, 16.8),
  dateRow('c', 'Cal', 240, 30, 'America/Chicago'),
  dateRow('x', undefined, 260, 5, 'Europe/Rome'),
];

describe('where you stand', () => {
  it('Egg Day: your named line’s place among named players (anonymous rows aren’t counted)', () => {
    expect(dateStanding(board, [board[2]], DEADLINE, NOW, null)).toEqual({ place: 3, of: 4, wouldBe: false });
    expect(standingWords({ place: 3, of: 4, wouldBe: false })).toBe('3rd of 4 named players');
  });

  it('not on the board under a name: where your answer would be', () => {
    const others = board.filter(r => r.id !== 'me');
    const s = dateStanding(others, [], DEADLINE, NOW, { te: 249, spareSeconds: 3600 });
    expect(s).toEqual({ place: 2, of: 4, wouldBe: true });
    expect(standingWords(s)).toBe('would be 2nd of 4 named players');
    expect(dateStanding(others, [], DEADLINE, NOW, null)).toBeNull();
    expect(dateStanding(null, [], DEADLINE, NOW, { te: 249, spareSeconds: 0 })).toBeNull();
  });

  it('the race: by finish', () => {
    const rows = [raceRow('r1', 'Ann', 400, 'Europe/Paris'), raceRow('r2', 'Bob', 500, 'Asia/Tokyo'), raceRow('r3', 'Me', 450)];
    expect(raceStanding(rows, [rows[2]], 490, NOW, null)).toEqual({ place: 2, of: 3, wouldBe: false });
    const s = raceStanding(rows.slice(0, 2), [], 490, NOW, NOW + 420 * 86400_000);
    expect(s).toEqual({ place: 2, of: 3, wouldBe: true });
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ]);
  });
});
