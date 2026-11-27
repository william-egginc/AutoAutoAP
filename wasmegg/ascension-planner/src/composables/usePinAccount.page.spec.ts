/**
 * The page's PIN instance (usePinAccount()) is wired to the page's calendar feed: a PIN set here makes THIS account's feed forget its
 * link (the collector deleted it); a PIN set for a refused request, or an enter, leaves it alone. Placeholder ID and URLs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const K = 'a'.repeat(64);
const ID = 'EI1234567890123456';
vi.mock('@/stores/initialState', () => ({ useInitialStateStore: () => ({ rawBackup: { eiUserId: ID } }) }));
vi.mock('./useOverrideSync', () => ({ syncTarget: () => ({ url: 'https://collector.example/sync', k: K }) }));

import { usePinAccount, resetPinAccounts } from './usePinAccount';
import { calendarFeedFor, resetCalendarFeeds } from './useCalendarFeed';
import { accountOf } from '@/search/runSaves';
import { resetPinSessions } from '@/lib/pinSession';

let answer: { status: number; body: unknown };
beforeEach(() => {
  resetPinAccounts();
  resetCalendarFeeds();
  resetPinSessions();
  answer = { status: 200, body: { ok: true, session: `v1.${Date.now() + 86_400_000 * 20}.1.${'c'.repeat(64)}`, expires: Date.now() + 86_400_000 * 20, recovery: 'ABCD2345EFGH6723', revokedLinks: 1 } };
  vi.stubGlobal('fetch', async () => ({ ok: answer.status < 300, status: answer.status, json: async () => answer.body, headers: { get: () => null } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const feed = () => calendarFeedFor(accountOf({ eiUserId: ID } as never));

describe('the page instance and the calendar feed', () => {
  it('a PIN set makes the same account\'s feed forget its link', async () => {
    const f = feed();
    const spy = vi.spyOn(f, 'linksGone');
    await usePinAccount().setPin('123456');
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('a refused set (the account already has a PIN) leaves the feed alone', async () => {
    answer = { status: 409, body: { error: 'a PIN is already set' } };
    const spy = vi.spyOn(feed(), 'linksGone');
    await usePinAccount().setPin('123456');
    expect(spy).not.toHaveBeenCalled();
  });
});
