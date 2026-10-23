/**
 * "Follow this route" (lib/follow.ts, stores/follow.ts): kept per account (under the SHA-256 of the ID, never the ID)
 * and per goal; a board row's goal; a typed route. Ids are placeholders only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { hashID } from '@/lib/storage/db';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { eggDaySeconds } from './eggDay';
import {
  FOLLOW_PREFIX,
  boardGoalKey,
  followedFromNow,
  parseTypedRoute,
  readFollows,
  screenGoalKey,
  writeFollow,
} from './follow';

const ID = 'EI1234567890123456';
const OTHER = 'EI0000000000000000';
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

describe('kept per account and goal', () => {
  it('writes under aap-follow:<hash>, one entry per goal, and forgets one goal without the other', () => {
    writeFollow('h1', 'fastest-490', { chain: [197, 222, 490], from: 'typed', at: 1 });
    writeFollow('h1', 'eggday-2027', { chain: [200, 300], from: 'board', at: 2 });
    expect([...mem.keys()]).toEqual([`${FOLLOW_PREFIX}h1`]);
    expect(readFollows('h1')['fastest-490'].chain).toEqual([197, 222, 490]);
    expect(readFollows('h1')['eggday-2027'].from).toBe('board');
    expect(readFollows('h2')).toEqual({});
    writeFollow('h1', 'fastest-490', null);
    expect(Object.keys(readFollows('h1'))).toEqual(['eggday-2027']);
  });

  it('a private window (storage throws) reads nothing and writing does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(readFollows('h1')).toEqual({});
    expect(writeFollow('h1', 'fastest-490', { chain: [490], from: 'typed', at: 1 })['fastest-490'].chain).toEqual([490]);
  });

  it('the store keeps the pick under the SHA-256 of the ID (never the ID), per account and goal', async () => {
    const initial = useInitialStateStore();
    initial.rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    expect(await follows.follow('fastest-490', [197, 222, 490], 'answer')).toBe(true);
    await follows.follow('eggday-2027', [200, 260], 'count');
    const hash = await hashID(ID);
    expect([...mem.keys()]).toEqual([`${FOLLOW_PREFIX}${hash}`]);
    expect([...mem.keys(), ...mem.values()].join(' ')).not.toContain(ID);
    expect(follows.followed('fastest-490')?.chain).toEqual([197, 222, 490]);
    expect(follows.isFollowed('eggday-2027', [200, 260])).toBe(true);
    expect(follows.isFollowed('fastest-490', [200, 260])).toBe(false);
    expect(follows.followedGoals().sort()).toEqual(['eggday-2027', 'fastest-490']);

    // Another account sees nothing of the first one's.
    expect(follows.followed('fastest-490', await hashID(OTHER))).toBeNull();

    await follows.unfollow('fastest-490');
    expect(follows.followed('fastest-490')).toBeNull();
    expect(follows.followed('eggday-2027')?.chain).toEqual([200, 260]);
  });

  it('the store holds the pick for the visit when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    await follows.follow('fastest-490', [300, 490], 'typed');
    expect(follows.followed('fastest-490')?.chain).toEqual([300, 490]);
  });
});

describe('the goal of a board row or a screen', () => {
  const egg2027 = eggDaySeconds(2027);
  it('an Egg Day row goes under Egg Day <year>, also a few hours off', () => {
    expect(boardGoalKey({ deadline: egg2027, finalTE: 300 })).toBe('eggday-2027');
    expect(boardGoalKey({ deadline: egg2027 + 3600, finalTE: 300 })).toBe('eggday-2027');
    expect(boardGoalKey({ deadline: eggDaySeconds(2028), finalTE: 300 })).toBe('eggday-2028');
  });
  it('another date goes under By a date for that date', () => {
    const d = Date.UTC(2027, 2, 3, 16) / 1000;
    expect(boardGoalKey({ deadline: d, finalTE: 280 })).toBe(`date-${d}`);
  });
  it("a race row goes under Race to its own target", () => {
    expect(boardGoalKey({ deadline: null, finalTE: 490 })).toBe('fastest-490');
    expect(boardGoalKey({ finalTE: 400 })).toBe('fastest-400');
  });
  it("a screen's goal: Fastest's target, Egg Day's own key, another date's", () => {
    expect(screenGoalKey(null, 490)).toBe('fastest-490');
    expect(screenGoalKey(egg2027, 490)).toBe('eggday-2027');
    expect(screenGoalKey(1900000000, 490)).toBe('date-1900000000');
  });
});

describe('a typed route', () => {
  it('splits on spaces, commas and arrows', () => {
    expect(parseTypedRoute('197 222 247', { currentTE: 190, target: null })).toEqual({ chain: [197, 222, 247] });
    expect(parseTypedRoute('197 → 222 → 490', { currentTE: 190, target: 490 })).toEqual({ chain: [197, 222, 490] });
    expect(parseTypedRoute('197->222, 490', { currentTE: 190, target: 490 })).toEqual({ chain: [197, 222, 490] });
  });
  it('drops stops already passed', () => {
    expect(parseTypedRoute('180 197 490', { currentTE: 190.4, target: 490 })).toEqual({ chain: [197, 490] });
  });
  it('says what to fix', () => {
    expect(parseTypedRoute('', { currentTE: 190, target: 490 })).toHaveProperty('error');
    expect(parseTypedRoute('222 197 490', { currentTE: 190, target: 490 })).toEqual({
      error: 'Each stop has to be higher than the one before it.',
    });
    expect(parseTypedRoute('197 222 500', { currentTE: 190, target: null })).toEqual({ error: 'The last stop can be 490 at most.' });
    expect(parseTypedRoute('197 222', { currentTE: 190, target: 490 })).toEqual({
      error: 'This race ends at 490: make that the last stop.',
    });
    expect(parseTypedRoute('150 180', { currentTE: 190, target: null })).toEqual({ error: 'Every stop is at or below your 190 TE now.' });
    expect(parseTypedRoute('197.5 222', { currentTE: 190, target: null })).toEqual({ error: 'Each stop is a whole number of TE.' });
  });
  it('a followed route from the save now keeps the target', () => {
    expect(followedFromNow([180, 197, 222, 490], 200)).toEqual([222, 490]);
  });
});

describe('a board row\'s summary for Follow (own runs)', () => {
  it('its finish, TE and start from the row\'s own times; a By a date row\'s last ascension', async () => {
    const { boardRowSummary } = await import('./follow');
    const race = { chain: [222, 490], durationDays: 9, finalTE: 490, startUtc: '2026-10-20T00:00:00Z', endUtc: '2026-10-29T00:00:00Z' };
    expect(boardRowSummary(race as never)).toEqual({ finish: Date.UTC(2026, 9, 29) / 1000, endTE: 490, planStart: Date.UTC(2026, 9, 20) / 1000 });
    const date = { ...race, chain: [200, 240], finalTE: 240, deadline: 1800000000, deadlineAscendAt: 1799990000 };
    expect(boardRowSummary(date as never)).toMatchObject({ finish: 1799990000, endTE: 240, deadline: 1800000000 });
    expect(boardRowSummary({ chain: [300], durationDays: 1, finalTE: 300 } as never)).toEqual({ endTE: 300 });
  });
});

