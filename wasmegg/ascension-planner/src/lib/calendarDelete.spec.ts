/**
 * Delete everything and the calendar links (QA 14 Nov 2026, Words' lines): the server returns deleted.calFeeds, which the client dropped, and neither
 * the confirm nor the result said the player's calendar stops showing the plan. With no links the old texts are byte-for-byte (syncWords.spec).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { forgetEverything, type SyncFetch } from './syncedRecords';
import { forgetCountsWords } from './saveOnlineWords';
import { SYNC_DELETE_CONFIRM, syncDeleteConfirm, syncDeleted } from './syncWords';
import { thisDevice } from '@/search/device';
import { CAL_OPEN_MYRUNS } from './calendarFeedWords';
import { CALENDAR_FEED } from './calendarCloud';

const K = 'd'.repeat(64);
const f = (deleted: Record<string, number>): SyncFetch => async () => ({ ok: true, status: 200, json: async () => ({ ok: true, deleted }), headers: { get: () => null } });
afterEach(() => {
  CALENDAR_FEED.enabled = false;
});

describe('the client keeps deleted.calFeeds', () => {
  it('a count above 0 is kept', async () => {
    const r = await forgetEverything('https://c.example/forget', K, f({ follows: 1, prefs: 0, answers: 0, synced: 1, calFeeds: 2 }));
    expect(r).toEqual({ ok: true, deleted: { follows: 1, prefs: 0, answers: 0, synced: 1, calFeeds: 2 } });
  });
  it('none, or an older collector that does not say: the counts are as before (no calFeeds key)', async () => {
    const a = await forgetEverything('https://c.example/forget', K, f({ follows: 1, prefs: 0, answers: 0, synced: 1 }));
    const b = await forgetEverything('https://c.example/forget', K, f({ follows: 1, prefs: 0, answers: 0, synced: 1, calFeeds: 0 }));
    expect(a).toEqual({ ok: true, deleted: { follows: 1, prefs: 0, answers: 0, synced: 1 } });
    expect(b).toEqual(a);
  });
});

describe("Words' Delete everything lines (0, 1 and 3 links)", () => {
  it('0 links: the old confirm and result, byte for byte', () => {
    expect(syncDeleteConfirm(0)).toBe(SYNC_DELETE_CONFIRM);
    expect(syncDeleted(0)).toBe(syncDeleted());
    expect(syncDeleted()).toBe(`Deleted. Nothing is saved online for this account now, and Save online is off on ${thisDevice()}.`);
  });
  it('1 link', () => {
    expect(syncDeleteConfirm(1)).toBe(
      "This deletes your followed routes, Setup and sharing choices, instant answers, starting TE, tracker ticks and plan from the planner's server. It also stops your calendar link working (1 link). Your save and what is kept in this browser stay. It cannot be undone."
    );
    expect(syncDeleted(1)).toBe(
      `Deleted. Nothing is saved online for this account now, and Save online is off on ${thisDevice()}. 1 calendar link stopped working. Your calendar may keep the events it already has until it next refreshes.`
    );
  });
  it('3 links', () => {
    expect(syncDeleteConfirm(3)).toBe(
      "This deletes your followed routes, Setup and sharing choices, instant answers, starting TE, tracker ticks and plan from the planner's server. It also stops your calendar links working (3 links). Your save and what is kept in this browser stay. It cannot be undone."
    );
    expect(syncDeleted(3)).toBe(
      `Deleted. Nothing is saved online for this account now, and Save online is off on ${thisDevice()}. 3 calendar links stopped working. Your calendar may keep the events it already has until it next refreshes.`
    );
  });
  it('before the call the count is not known: the confirm says "any calendar links" (null)', () => {
    expect(syncDeleteConfirm(null)).toContain('It also stops any calendar links working. Your save and what is kept in this browser stay.');
    expect(syncDeleteConfirm(null).startsWith(SYNC_DELETE_CONFIRM.split(' Your save')[0]!)).toBe(true);
  });
  it('no line starts with "Your plan"', () => {
    for (const t of [syncDeleteConfirm(null), syncDeleteConfirm(1), syncDeleted(2), CAL_OPEN_MYRUNS]) expect(t).not.toMatch(/^Your plan/);
  });
});

describe('the counts line', () => {
  it('has no calendar words (they are in the result line)', () => {
    expect(forgetCountsWords({ follows: 3, prefs: 2, answers: 2, synced: 1, calFeeds: 2 })).not.toMatch(/calendar/i);
  });
  it('a calendar link alone is not "nothing was saved"', () => {
    expect(forgetCountsWords({ follows: 0, prefs: 0, answers: 0, synced: 0, calFeeds: 1 })).not.toMatch(/^Nothing was saved/);
    expect(forgetCountsWords({ follows: 0, prefs: 0, answers: 0, synced: 0 })).toMatch(/^Nothing was saved/);
  });
});

describe("Words' My Runs line", () => {
  it('exactly', () => {
    expect(CAL_OPEN_MYRUNS).toBe('Open My Runs once so the plan reaches your calendar. It is only sent from there.');
  });
});
