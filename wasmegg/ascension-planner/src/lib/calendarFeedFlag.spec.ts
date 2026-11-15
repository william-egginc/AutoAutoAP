/**
 * THE CALENDAR FEED'S BUILD FLAG (spec-calendar-ui, 14 Nov 2026): beta's collector address is the LIVE collector, which has no
 * /cal and no 'cal' sync kind yet, so `CALENDAR_FEED.enabled` is false in the repo (like lib/syncedRecords.ts SYNC_RECORDS: one
 * line, flipped in the release that deploys the live collector). A QA build turns it on with VITE_CALENDAR_FEED=1. Off: no card,
 * and no /cal or kind=cal request of any kind, at the lowest layer (lib/calendarCloud.ts) and in the controller.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALENDAR_FEED, mintCalendarLink, putCalendar, revokeCalendarLinks } from './calendarCloud';
import { createCalendarFeed } from '@/composables/useCalendarFeed';
import { renderHtml, textOf } from '@/test/renderComponent';
import CalendarFeedSetup from '@/components/auto/CalendarFeedSetup.vue';
import type { SyncFetch } from './syncedRecords';

const K = 'd'.repeat(64);
const SYNC = 'https://collector.example/sync';
const URL_OK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';

function collector() {
  const calls: { url: string; method?: string }[] = [];
  const f: SyncFetch = async (url, init) => {
    calls.push({ url, method: init?.method });
    return { ok: true, status: 200, json: async () => (url.endsWith('/cal/new') ? { ok: true, url: URL_OK } : { ok: true, revoked: 1, updatedAt: 1 }), headers: { get: () => null } };
  };
  return { f, calls };
}
const mem = () => {
  const m = new Map<string, string>();
  // An account that had it on and linked (an earlier build with the flag on): the stored state must not wake it.
  m.set('aap.calFeed.a1', '1');
  m.set('aap.calFeed.a1.linked', '1');
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const lines = [{ key: 'k0', kind: 'research' as const, at: 1_800_000_000, text: 'buy Thing', tickable: true, checkIn: 0 }];

describe('the flag', () => {
  it('is off in the repo, and a QA build turns it on with VITE_CALENDAR_FEED=1', () => {
    expect(CALENDAR_FEED.enabled).toBe(false);
    expect(readFileSync(new URL('./calendarCloud.ts', import.meta.url), 'utf8')).toContain("export const CALENDAR_FEED = { enabled: import.meta.env.VITE_CALENDAR_FEED === '1' };");
  });
});

describe('with the flag off there is no card and no traffic', () => {
  beforeEach(() => {
    CALENDAR_FEED.enabled = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    CALENDAR_FEED.enabled = false;
    vi.useRealTimers();
  });

  it('the cloud calls refuse before any request', async () => {
    const { f, calls } = collector();
    expect(await mintCalendarLink(SYNC, K, f)).toEqual({ ok: false, why: 'off' });
    expect(await revokeCalendarLinks(SYNC, K, f)).toEqual({ ok: false, why: 'off' });
    expect(await putCalendar(SYNC, K, 1, { v: 1, asOf: 1, window: { from: 0, to: 1 }, src: 'x', events: [] }, f)).toMatchObject({ ok: false, why: 'off' });
    expect(calls).toEqual([]);
  });

  it('the controller: not available, even with an earlier on + linked state; nothing sent by any action or by a plan change', async () => {
    const { f, calls } = collector();
    const feed = createCalendarFeed({ storage: mem(), env: { account: 'a1', target: () => ({ url: SYNC, k: K }) }, fetch: f });
    expect(feed.available.value).toBe(false);
    await feed.getLink();
    await feed.confirmReset();
    feed.note({ now: 1_799_990_000_000, ascensionStart: 1_799_000_000, lines, ticks: new Set<string>(), zone: 'UTC', hours: null });
    await vi.advanceTimersByTimeAsync(30_000);
    await feed.turnOff();
    expect(calls).toEqual([]);
    expect(feed.link.value).toBeNull();
  });

  it('the card draws nothing', async () => {
    const feed = createCalendarFeed({ storage: mem(), env: { account: 'a1', target: () => ({ url: SYNC, k: K }) }, fetch: collector().f });
    expect(textOf(await renderHtml(CalendarFeedSetup, { feed }))).toBe('');
  });
});

describe('with the flag on (a QA build) it works as before', () => {
  beforeEach(() => {
    CALENDAR_FEED.enabled = true;
  });
  afterEach(() => {
    CALENDAR_FEED.enabled = false;
  });
  it('mint goes out', async () => {
    const { f, calls } = collector();
    expect(await mintCalendarLink(SYNC, K, f)).toEqual({ ok: true, url: URL_OK });
    expect(calls).toHaveLength(1);
  });
});
