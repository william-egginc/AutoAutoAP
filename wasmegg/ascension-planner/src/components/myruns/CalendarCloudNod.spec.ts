/**
 * The nod to the cloud calendar under "Add all N upcoming to calendar" on My runs' plan table (Jordan, 15 Nov 2026): not set up, a line suggesting
 * it; set up, an "Update cloud calendar" button that sends the current plan now. All behind the calendar flag. A fake collector as in
 * CalendarFeedSetup.spec. DRAFT words (Words writes them).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import CalendarCloudNod from './CalendarCloudNod.vue';
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

const K = 'c'.repeat(64);
const URL_OK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const f: SyncFetch = async url => ({ ok: true, status: 200, json: async () => (url.endsWith('/cal/new') ? { ok: true, url: URL_OK } : { ok: true, updatedAt: 1 }), headers: { get: () => null } });
const make = (target = true) =>
  createCalendarFeed({ storage: store(), env: { account: 'a1', target: () => (target ? { url: 'https://collector.example/sync', k: K } : null) }, fetch: f });
const render = (feed: ReturnType<typeof make>) => renderHtml(CalendarCloudNod, { feed });

describe('not set up', () => {
  it('a line suggesting it, no button', async () => {
    const html = await render(make());
    expect(html).toContain('data-testid="cal-nod-suggest"');
    expect(textOf(html)).toContain(W.CAL_NOD_SUGGEST);
    expect(html).not.toContain('cal-nod-update');
  });
  it('switched on but no link yet: still the suggestion (nothing to update)', async () => {
    const feed = make();
    feed.turnOn();
    const html = await render(feed);
    expect(html).toContain('cal-nod-suggest');
    expect(html).not.toContain('cal-nod-update');
  });
});

describe('set up (switched on, with a link)', () => {
  it('the button, no suggestion', async () => {
    const feed = make();
    feed.turnOn();
    await feed.getLink();
    const html = await render(feed);
    expect(html).toMatch(/data-testid="cal-nod-update"[^>]*>\s*Update cloud calendar\s*</);
    expect(html).not.toContain('cal-nod-suggest');
  });
  it('after a send it says so; after a no-change press it says that; a failure shows the existing upload line', async () => {
    const feed = make();
    feed.turnOn();
    await feed.getLink();
    feed.pushed.value = 'sent';
    expect(textOf(await render(feed))).toContain(W.CAL_NOD_SENT);
    feed.pushed.value = 'same';
    expect(textOf(await render(feed))).toContain(W.CAL_NOD_SAME);
    feed.pushed.value = '';
    feed.error.value = 'upload';
    const err = await render(feed);
    expect(textOf(err)).toContain(W.CAL_ERRORS.upload);
    expect(err).toContain('role="alert"');
    expect(textOf(err)).not.toContain(W.CAL_NOD_SENT);
  });
  it('the button is off while the cool-down runs', async () => {
    const feed = make();
    feed.turnOn();
    await feed.getLink();
    feed.pushCoolingDown.value = true;
    expect(await render(feed)).toMatch(/<button[^>]*disabled[^>]*data-testid="cal-nod-update"/);
  });
});

describe('with the flag off, or no collector: nothing at all', () => {
  it('flag off', async () => {
    CALENDAR_FEED.enabled = false;
    expect(textOf(await render(make()))).toBe('');
  });
  it('no online target', async () => {
    expect(textOf(await render(make(false)))).toBe('');
  });
});

describe('under the Add all button (source pin)', () => {
  const t = readFileSync(new URL('./EventsTable.vue', import.meta.url), 'utf8');
  it('inside the same block as the button, only where the button is, after it', () => {
    const block = t.slice(t.indexOf('<div v-if="upcoming.length > 1" class="mt-2">'), t.indexOf('<!-- Rounded (the instant answer'));
    expect(block).toContain('<CalendarButton');
    expect(block).toContain('<CalendarCloudNod />');
    expect(block.indexOf('<CalendarButton')).toBeLessThan(block.indexOf('<CalendarCloudNod />'));
  });
});
