/**
 * Delete everything and the calendar links (QA 14 Nov 2026): the server returns deleted.calFeeds, which the client dropped, and neither the confirm
 * nor the result said the player's calendar stops showing the plan. The confirm line only exists in a build with the calendar flag on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { forgetEverything, type SyncFetch } from './syncedRecords';
import { forgetCountsWords } from './saveOnlineWords';
import { CAL_DELETE_NOTE, calDeletedWords } from './calendarFeedWords';
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

describe('the words', () => {
  it('the result says how many calendar links stopped working, only when there were some', () => {
    const base = { follows: 3, prefs: 2, answers: 2, synced: 1 };
    expect(forgetCountsWords(base)).not.toMatch(/calendar/i);
    expect(forgetCountsWords({ ...base, calFeeds: 1 })).toContain(calDeletedWords(1));
    expect(forgetCountsWords({ ...base, calFeeds: 2 })).toContain(calDeletedWords(2));
    expect(calDeletedWords(1)).toBe('1 calendar link stopped working.');
    expect(calDeletedWords(2)).toBe('2 calendar links stopped working.');
  });
  it('a calendar link alone is not "nothing was saved"', () => {
    expect(forgetCountsWords({ follows: 0, prefs: 0, answers: 0, synced: 0, calFeeds: 1 })).not.toMatch(/^Nothing was saved/);
    expect(forgetCountsWords({ follows: 0, prefs: 0, answers: 0, synced: 0 })).toMatch(/^Nothing was saved/);
  });
  it('the confirm line', () => {
    expect(CAL_DELETE_NOTE).toBe('Your calendar links stop working too.');
  });
});
