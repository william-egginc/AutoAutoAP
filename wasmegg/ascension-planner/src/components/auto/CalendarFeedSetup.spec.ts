/**
 * The calendar feed's Setup card (spec-calendar-ui, 14 Nov 2026), rendered against a FAKE collector (composables/
 * useCalendarFeed.spec.ts has the behaviour): off by default with Words' lines; once on, Get link; once got, the link box with
 * Copy and the two subscribe links; Reset link asks first. Hidden without an online target. No privacy text yet.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import CalendarFeedSetup from './CalendarFeedSetup.vue';
import { createCalendarFeed } from '@/composables/useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import * as W from '@/lib/calendarFeedWords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';

// The build flag is off in the repo (lib/calendarFeedFlag.spec.ts); these specs are of a build with it on.
beforeEach(() => {
  CALENDAR_FEED.enabled = true;
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
});

const K = 'c'.repeat(64);
const URL_OK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const f: SyncFetch = async url => ({ ok: true, status: 200, json: async () => (url.endsWith('/cal/new') ? { ok: true, url: URL_OK } : { ok: true, revoked: 1 }), headers: { get: () => null } });
const make = (target = true) =>
  createCalendarFeed({ storage: store(), env: { account: 'a1', target: () => (target ? { url: 'https://collector.example/sync', k: K } : null) }, fetch: f, clipboard: { writeText: async () => undefined } });
const render = (feed: ReturnType<typeof make>) => renderHtml(CalendarFeedSetup, { feed });

describe('the card', () => {
  it('off by default: its own switch, unticked, Words\' off line, no buttons', async () => {
    const html = await render(make());
    const t = textOf(html);
    expect(t).toContain(W.CAL_LABEL);
    expect(t).toContain(W.CAL_OFF);
    expect(html).toMatch(/<input[^>]*data-testid="calendar-feed-switch"/);
    expect(html.match(/<input[^>]*data-testid="calendar-feed-switch"[^>]*>/)?.[0]).not.toContain('checked');
    for (const id of ['get', 'copy', 'apple', 'google', 'reset', 'stale']) expect(html).not.toContain(`data-testid="calendar-feed-${id}"`);
  });
  it('hidden without a collector or with Save online off', async () => {
    expect(textOf(await render(make(false)))).toBe('');
  });
  it('on, no link: the line, the staleness note and Get link (44 px); no Reset yet', async () => {
    const feed = make();
    feed.turnOn();
    const html = await render(feed);
    const t = textOf(html);
    expect(t).toContain(W.CAL_LINE);
    expect(t).toContain(W.CAL_STALE);
    expect(t).toContain(W.CAL_GET);
    expect(html.match(/<button[^>]*data-testid="calendar-feed-get"[^>]*>/)?.[0]).toContain('min-h-[44px]');
    expect(html).not.toContain('data-testid="calendar-feed-reset"');
  });
  it('with the link: shown once with Copy, Add to Apple Calendar (webcal) and Add to Google Calendar (?cid=), and Reset link', async () => {
    const feed = make();
    feed.turnOn();
    await feed.getLink();
    const html = await render(feed);
    const t = textOf(html);
    expect(html).toContain(`value="${URL_OK}"`);
    expect(t).toContain(W.CAL_SHOWN_ONCE);
    expect(t).toContain(W.CAL_COPY);
    expect(html.match(/<a[^>]*data-testid="calendar-feed-apple"[^>]*>/)?.[0]).toContain('href="webcal://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics"');
    const g = html.match(/<a[^>]*data-testid="calendar-feed-google"[^>]*>/)?.[0] ?? '';
    expect(g).toContain('href="https://calendar.google.com/calendar/r?cid=');
    expect(g).toContain('rel="noopener"');
    expect(t).toContain(W.CAL_APPLE);
    expect(t).toContain(W.CAL_GOOGLE);
    expect(t).toContain(W.CAL_RESET);
    expect(html).not.toContain('data-testid="calendar-feed-get"');
  });
  it('a later visit: it says a link exists, never shows it, and offers Reset', async () => {
    const s = store();
    const mk = () => createCalendarFeed({ storage: s, env: { account: 'a1', target: () => ({ url: 'https://collector.example/sync', k: K }) }, fetch: f, clipboard: null });
    const a = mk();
    a.turnOn();
    await a.getLink();
    const html = await render(mk());
    expect(html).not.toContain('AbCdEfGh');
    expect(textOf(html)).toContain(W.CAL_LINKED);
    expect(html).toContain('data-testid="calendar-feed-reset"');
  });
  it('Reset link asks first, with Words\' question and Reset / Keep it', async () => {
    const feed = make();
    feed.turnOn();
    await feed.getLink();
    feed.askReset();
    const t = textOf(await render(feed));
    expect(t).toContain(W.CAL_RESET_ASK);
    expect(t).toContain(W.CAL_RESET_YES);
    expect(t).toContain(W.CAL_RESET_NO);
  });
});

describe('where it is, and what it is not', () => {
  const setup = readFileSync(new URL('./YourSetup.vue', import.meta.url), 'utf8');
  it('in Setup right after Save online, made for the account on screen', () => {
    expect(setup.indexOf('<CalendarFeedSetup')).toBeGreaterThan(setup.indexOf('<SaveOnlineSetup'));
    expect(setup).toContain(':key="calendarAccount"');
  });
  it('no privacy wording yet (Words\' part 1C waits for Jordan\'s OK)', () => {
    const words = readFileSync(new URL('../../lib/calendarFeedWords.ts', import.meta.url), 'utf8');
    expect(words).not.toMatch(/scrambled|fingerprint|maintainer could/i);
  });
  it('My runs hands the feed the tracker\'s plan', () => {
    const view = readFileSync(new URL('../MyRunsView.vue', import.meta.url), 'utf8');
    expect(view).toContain('useCalendarFeedPush({');
  });
});

describe('Words\' final lines (14 Nov 2026)', () => {
  it('the linked line, the 3-links error and the Save online error', () => {
    expect(W.CAL_LINKED).toBe('You have a link. It was shown only once, when you made it. Press Reset link to make a new one.');
    expect(W.CAL_ERRORS.limit).toBe('You already have 3 links. Press Reset link, then get a new one.');
    expect(W.CAL_ERRORS.off).toBe('Calendar links need Save online turned on in Setup.');
  });
  it('Reset link really frees the slots (it revokes every link of the account at once)', () => {
    expect(readFileSync(new URL('../../lib/calendarCloud.ts', import.meta.url), 'utf8')).toContain('{ k, all: true }');
  });
});
