/**
 * "Follow this route" is never offered on a route that lands after Egg Day starts or after your date
 * (lib/eggDayRule.ts, Jordan 22 Oct 2026): lib/follow.ts `followableRow` (board rows) and `followableAnswer`
 * (saved By a date answers).
 */
import { describe, expect, it } from 'vitest';
import { followableAnswer, followableRow } from './follow';
import { eggDaySeconds } from './eggDay';
import type { BoardRow } from './leaderboardRank';

const H = 3600;
const EGG = eggDaySeconds(2027);
const MAR3 = Date.UTC(2027, 2, 3, 7) / 1000;
const row = (o: Partial<BoardRow>) => ({ chain: [200, 249], finalTE: 249, durationDays: 100, ...o }) as BoardRow;

describe('followableRow', () => {
  it('Egg Day: before and exactly at the start, yes; after, no', () => {
    expect(followableRow(row({ deadline: EGG, deadlineAscendAt: EGG - H }))).toBe(true);
    expect(followableRow(row({ deadline: EGG, deadlineAscendAt: EGG }))).toBe(true);
    expect(followableRow(row({ deadline: EGG, deadlineAscendAt: EGG + H }))).toBe(false);
  });

  it('By a date: the same against its date', () => {
    expect(followableRow(row({ deadline: MAR3, deadlineAscendAt: MAR3 - H }))).toBe(true);
    expect(followableRow(row({ deadline: MAR3, deadlineAscendAt: MAR3 + H }))).toBe(false);
  });

  it('a race row: always', () => {
    expect(followableRow(row({ finalTE: 490, chain: [200, 490] }))).toBe(true);
  });
});

describe('followableAnswer', () => {
  it('its last ascension (ascendAt, else the date less spare) against the date', () => {
    expect(followableAnswer({ ascendAt: EGG - H, spare: H }, EGG)).toBe(true);
    expect(followableAnswer({ ascendAt: EGG, spare: 0 }, EGG)).toBe(true);
    expect(followableAnswer({ ascendAt: EGG + H, spare: -H }, EGG)).toBe(false);
    expect(followableAnswer({ spare: -2 * H }, MAR3)).toBe(false);
    expect(followableAnswer({ spare: 2 * H }, MAR3)).toBe(true);
  });

  it('no route: no; an old answer without either time: offered, as before', () => {
    expect(followableAnswer(null, EGG)).toBe(false);
    expect(followableAnswer({}, EGG)).toBe(true);
  });
});
