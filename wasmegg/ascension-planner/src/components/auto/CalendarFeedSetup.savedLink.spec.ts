/**
 * THE CALENDAR CARD'S SAVED-LINK STATES (callink, 17 Nov 2026; Jordan: the calendar link shows in all of a player's browsers). The
 * composable (Collector's spec-callink-client) gives `savedState` ('none' | 'checking' | 'loaded' | 'unreadable'), `linkFromSave` and
 * `replaceLink()`; the card is rendered here from a STAND-IN feed (no network, placeholder URLs only). 'none' is today's card (the older
 * specs); 'loaded': the saved link with Copy and the two subscribe links, and not the once-only warning; 'unreadable': it says so and offers a
 * new link, asking first (it stops every link already added to a calendar app); 'checking': a quiet line, no Get link yet.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import CalendarFeedSetup from './CalendarFeedSetup.vue';
import { createCalendarFeed } from '@/composables/useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import * as W from '@/lib/calendarFeedWords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';

beforeEach(() => {
  CALENDAR_FEED.enabled = true;
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
});

const URL_OK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const f: SyncFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }), headers: { get: () => null } });
const real = () =>
  createCalendarFeed({ storage: store(), env: { account: 'a1', target: () => ({ url: 'https://collector.example/sync', k: 'c'.repeat(64) }) }, fetch: f, clipboard: { writeText: async () => undefined } });
type State = 'none' | 'checking' | 'loaded' | 'unreadable';
/** The stand-in: a real feed's shape with the saved-link surface and the state a spec wants. */
function feedIn(state: State, o: { link?: string | null; linked?: boolean } = {}) {
  const base = real();
  base.turnOn();
  const replaceLink = vi.fn(async () => undefined);
  const linked = o.linked ?? state !== 'none';
  const link = o.link === undefined ? (state === 'loaded' ? URL_OK : null) : o.link;
  return Object.assign(base, {
    linked: ref(linked),
    link: ref(link),
    canReset: ref(linked),
    savedState: ref(state),
    linkFromSave: ref(state === 'loaded'),
    replaceLink,
  });
}
const render = (feed: ReturnType<typeof feedIn>) => renderHtml(CalendarFeedSetup, { feed });
const card = readFileSync(new URL('./CalendarFeedSetup.vue', import.meta.url), 'utf8');

describe('loaded: your saved link (from another browser)', () => {
  it('shows the link in its box with Copy, Add to Apple Calendar and Add to Google Calendar, and Reset link', async () => {
    const html = await render(feedIn('loaded'));
    expect(html).toContain('data-testid="calendar-feed-link"');
    expect(html).toContain(`value="${URL_OK}"`);
    for (const id of ['copy', 'apple', 'google', 'reset']) expect(html, id).toContain(`data-testid="calendar-feed-${id}"`);
    expect(html).toContain('webcal://');
  });
  it('says it is the saved link, not the "shown only once" warning, and not "you have a link"', async () => {
    const html = await render(feedIn('loaded'));
    const t = textOf(html);
    expect(t).toContain(W.CAL_SAVED);
    expect(t).not.toContain(W.CAL_SHOWN_ONCE);
    expect(t).not.toContain(W.CAL_LINKED);
    expect(html).toContain('data-testid="calendar-feed-saved"');
    expect(html).not.toContain('data-testid="calendar-feed-once"');
    expect(html).not.toContain('data-testid="calendar-feed-get"');
  });
  it('a link just made in this browser keeps the once-only warning (linkFromSave false)', async () => {
    const feed = feedIn('loaded');
    feed.linkFromSave.value = false;
    const html = await render(feed);
    expect(textOf(html)).toContain(W.CAL_SHOWN_ONCE);
    expect(html).not.toContain('data-testid="calendar-feed-saved"');
  });
  it('the live region says the saved line, so a screen reader hears it', () => {
    expect(card).toMatch(/liveText = computed\([\s\S]*?CAL_SAVED/);
  });
});

describe("unreadable: a saved copy that can't be read here", () => {
  it('says so, with one button for a new link (44 px), and neither the link box nor "you have a link"', async () => {
    const html = await render(feedIn('unreadable'));
    const t = textOf(html);
    expect(t).toContain(W.CAL_UNREADABLE);
    expect(t).not.toContain(W.CAL_LINKED);
    expect(html).not.toContain('data-testid="calendar-feed-link-box"');
    expect(html).not.toContain('data-testid="calendar-feed-get"');
    const btn = html.match(/<button[^>]*data-testid="calendar-feed-replace"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain('min-h-[44px]');
    expect(t).toContain(W.CAL_REPLACE);
  });
  it('asks once before it calls replaceLink (it revokes every link): a confirm with the words, Keep it first for focus', () => {
    expect(card).toMatch(/data-testid="calendar-feed-replace-confirm"/);
    expect(card).toMatch(/role="alertdialog"[^>]*aria-labelledby="calendar-feed-replace-text"/);
    expect(card).toContain('{{ CAL_REPLACE_ASK }}');
    expect(card).toMatch(/data-testid="calendar-feed-replace-yes"[\s\S]{0,200}/);
    // replaceLink is called only through the Yes button's doReplace, never from the first button.
    expect(card.match(/replaceLink\?\.\(\)/g)).toHaveLength(1);
    expect(card).toMatch(/data-testid="calendar-feed-replace-yes"[^>]*@click="doReplace\(\)"|@click="doReplace\(\)"[\s\S]{0,80}data-testid="calendar-feed-replace-yes"|:disabled="feed.busy.value"\s+data-testid="calendar-feed-replace-yes"\s+@click="doReplace\(\)"/);
    expect(card).toMatch(/data-testid="calendar-feed-replace"\s+@click="askingReplace = true"/);
    expect(card).toMatch(/replaceKeepBtn\.value\?\.focus\(\)/);
  });
  it('the confirm says every link already added stops, and that the new one is added instead', () => {
    expect(W.CAL_REPLACE_ASK).toMatch(/stops/);
    expect(W.CAL_REPLACE_ASK).toMatch(/new one/);
  });
  it('Reset link stays offered (the same way out as before)', async () => {
    expect(await render(feedIn('unreadable'))).toContain('data-testid="calendar-feed-reset"');
  });
});

describe('checking: looking for the saved link', () => {
  it('a quiet line and no Get link yet (a new link made too soon would revoke nothing but hide the saved one)', async () => {
    const html = await render(feedIn('checking', { linked: false }));
    expect(textOf(html)).toContain(W.CAL_CHECKING);
    expect(html).toContain('data-testid="calendar-feed-checking"');
    expect(html).not.toContain('data-testid="calendar-feed-get"');
    expect(html).not.toContain('data-testid="calendar-feed-link-box"');
  });
});

describe('none, and a feed without the new surface: exactly today\'s card', () => {
  it('none, no link: Get link; none, linked marker: "you have a link" and Reset', async () => {
    expect(await render(feedIn('none', { linked: false }))).toContain('data-testid="calendar-feed-get"');
    const t = textOf(await render(feedIn('none', { linked: true })));
    expect(t).toContain(W.CAL_LINKED);
  });
  it('a feed with no savedState at all (the older composable) renders as before, no new text', async () => {
    const feed = real();
    feed.turnOn();
    const t = textOf(await renderHtml(CalendarFeedSetup, { feed }));
    for (const w of [W.CAL_SAVED, W.CAL_UNREADABLE, W.CAL_CHECKING, W.CAL_REPLACE_ASK]) expect(t).not.toContain(w);
    expect(t).toContain(W.CAL_GET);
  });
});

describe('words', () => {
  it('Words-owned text in lib/calendarFeedWords.ts, nothing about "this device", no link or key in any of it', () => {
    for (const w of [W.CAL_SAVED, W.CAL_UNREADABLE, W.CAL_CHECKING, W.CAL_REPLACE, W.CAL_REPLACE_ASK, W.CAL_REPLACE_YES]) {
      expect(w).toBeTruthy();
      expect(w).not.toMatch(/this device|this computer|https?:/i);
    }
  });
});
