/**
 * The calendar feed's calls (spec-calendar-ui, 14 Nov 2026), against a FAKE collector (the test collector's shapes,
 * notes/calendar-feed-build-2026-11-14.md): POST /cal/new with k in the body, POST /cal/revoke with { k, all: true }, the
 * subscribe links, and the 'cal' sync record. No network, no real key or ID.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CALENDAR_FEED, calBaseOf, googleCalendarUrl, mintCalendarLink, putCalendar, revokeCalendarLinks, webcalUrl } from './calendarCloud';
import type { SyncFetch } from './syncedRecords';

// The build flag is off in the repo (calendarFeedFlag.spec.ts); these specs are of a build with it on.
beforeEach(() => {
  CALENDAR_FEED.enabled = true;
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
});

const K = 'a'.repeat(64);
const SYNC = 'https://collector.example/sync';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const URL_OK = `https://collector.example/cal/${TOKEN}.ics`;

interface Call { url: string; method?: string; body?: string; headers?: Record<string, string> }
/** A collector in a closure: records every call, answers with what the test set. */
function fake(answer: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const f: SyncFetch = async (url, init) => {
    const c: Call = { url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined, headers: init?.headers };
    calls.push(c);
    const a = answer(c);
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body ?? {}, headers: { get: () => null } };
  };
  return { f, calls };
}

describe('where the calendar calls go', () => {
  it('/cal from the /sync address; nothing without a collector', () => {
    expect(calBaseOf(SYNC)).toBe('https://collector.example/cal');
    expect(calBaseOf('')).toBe('');
    expect(calBaseOf('https://collector.example/other')).toBe('');
  });
});

describe('mint: POST /cal/new with k in the BODY, never the address', () => {
  it('sends { k } as JSON and returns the url once', async () => {
    const { f, calls } = fake(() => ({ status: 200, body: { ok: true, url: URL_OK } }));
    const r = await mintCalendarLink(SYNC, K, f);
    expect(r).toEqual({ ok: true, url: URL_OK });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://collector.example/cal/new');
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body!)).toEqual({ k: K });
    expect(calls[0].url).not.toContain(K);
    expect(calls[0].headers?.['content-type']).toBe('application/json');
  });
  it('409 is "limit": three live links already; 429 is "busy"', async () => {
    expect(await mintCalendarLink(SYNC, K, fake(() => ({ status: 409 })).f)).toEqual({ ok: false, why: 'limit' });
    expect(await mintCalendarLink(SYNC, K, fake(() => ({ status: 429 })).f)).toEqual({ ok: false, why: 'busy' });
  });
  it('a url that is not a collector feed address is refused, never shown', async () => {
    for (const bad of ['javascript:alert(1)', 'https://collector.example/cal/short.ics', 'https://collector.example/other', '']) {
      const r = await mintCalendarLink(SYNC, K, fake(() => ({ status: 200, body: { ok: true, url: bad } })).f);
      expect(r).toEqual({ ok: false, why: 'error' });
    }
  });
  it('no key, no collector, no fetch, or no answer: a quiet failure, nothing thrown', async () => {
    expect(await mintCalendarLink('', K, fake(() => ({ status: 200 })).f)).toEqual({ ok: false, why: 'off' });
    expect(await mintCalendarLink(SYNC, 'nope', fake(() => ({ status: 200 })).f)).toEqual({ ok: false, why: 'off' });
    const down: SyncFetch = async () => {
      throw new Error('offline');
    };
    expect(await mintCalendarLink(SYNC, K, down)).toEqual({ ok: false, why: 'offline' });
  });
});

describe('reset: POST /cal/revoke { k, all: true }', () => {
  it('sends the key in the body and says how many it revoked', async () => {
    const { f, calls } = fake(() => ({ status: 200, body: { ok: true, revoked: 2 } }));
    expect(await revokeCalendarLinks(SYNC, K, f)).toEqual({ ok: true, revoked: 2 });
    expect(calls[0].url).toBe('https://collector.example/cal/revoke');
    expect(JSON.parse(calls[0].body!)).toEqual({ k: K, all: true });
    expect(calls[0].url).not.toContain(K);
  });
  it('a failure is a failure, not a success', async () => {
    expect(await revokeCalendarLinks(SYNC, K, fake(() => ({ status: 500 })).f)).toMatchObject({ ok: false });
  });
});

describe('the subscribe links', () => {
  it('Apple: the same address with webcal://', () => {
    expect(webcalUrl(URL_OK)).toBe(`webcal://collector.example/cal/${TOKEN}.ics`);
  });
  it('Google: calendar.google.com ?cid= with the webcal address, encoded', () => {
    const g = googleCalendarUrl(URL_OK);
    expect(g.startsWith('https://calendar.google.com/calendar/')).toBe(true);
    expect(g).toContain('cid=' + encodeURIComponent(`webcal://collector.example/cal/${TOKEN}.ics`));
  });
});

describe('the calendar record: PUT /sync kind cal slot 0', () => {
  it('goes to /sync with kind=cal&slot=0 and the list as the body', async () => {
    const { f, calls } = fake(() => ({ status: 200, body: { updatedAt: 5, unchanged: false } }));
    const list = { v: 1 as const, asOf: 1, window: 14, src: 'x', events: [] };
    const r = await putCalendar(SYNC, K, 1_700_000_000_000, list as never, f);
    expect(r.ok).toBe(true);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('kind=cal');
    expect(calls[0].url).toContain('slot=0');
    expect(JSON.parse(calls[0].body!)).toEqual(list);
  });
  it('a body with a player ID in it is never sent', async () => {
    const { f, calls } = fake(() => ({ status: 200 }));
    const list = { v: 1 as const, asOf: 1, window: 14, src: 'x', events: [{ title: 'EI1234567890123456' }] };
    const r = await putCalendar(SYNC, K, 1, list as never, f);
    expect(r).toMatchObject({ ok: false, why: 'id' });
    expect(calls).toHaveLength(0);
  });
});
