/**
 * Review W6 (15 Nov 2026): the calendar card's one-time link and "Copied" were not announced to a screen reader, and neither the
 * calendar Reset confirm nor Delete everything's confirm (both role="alertdialog") took focus when they appeared, so a keyboard
 * player pressed Reset and found focus gone. Each confirm now puts focus on its safe button ("Keep it", "No"), and gives it back
 * to the button that asked when it is dismissed. No DOM here (node environment): markup rendered on the server, focus code pinned.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import CalendarFeedSetup from './CalendarFeedSetup.vue';
import { createCalendarFeed } from '@/composables/useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';

beforeEach(() => {
  CALENDAR_FEED.enabled = true;
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
});

const cal = readFileSync(new URL('./CalendarFeedSetup.vue', import.meta.url), 'utf8');
const sync = readFileSync(new URL('./SaveOnlineSetup.vue', import.meta.url), 'utf8');

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const f: SyncFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, url: 'https://c.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics' }), headers: { get: () => null } });

describe('the calendar card announces the link and Copied', () => {
  it('a live region is always there (an element added already full is not announced), empty until there is something to say', async () => {
    const feed = createCalendarFeed({ storage: store(), env: { account: 'a1', target: () => ({ url: 'https://c.example/sync', k: 'c'.repeat(64) }) }, fetch: f, clipboard: { writeText: async () => undefined } });
    feed.turnOn();
    const html = await renderHtml(CalendarFeedSetup, { feed });
    expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite" data-testid="calendar-feed-live"><\/p>/);
  });
  it('says Words\' "Copied" and the shown-once line there', () => {
    // The saved link (callink, 17 Nov 2026) says its own line instead of the shown-once one.
    expect(cal).toContain("const liveText = computed(() => (feed.copied.value ? CAL_COPIED : feed.link.value ? (fromSave.value ? CAL_SAVED : CAL_SHOWN_ONCE) : ''));");
    expect(cal).toContain('{{ liveText }}');
  });
});

describe('a confirm takes focus when it appears and gives it back when dismissed', () => {
  it('the calendar Reset confirm: focus on "Keep it"; back on Reset link after Keep it', () => {
    expect(cal).toMatch(/ref="keepBtn"[\s\S]{0,400}data-testid="calendar-feed-reset-no"/);
    expect(cal).toMatch(/ref="resetBtn"/);
    expect(cal).toMatch(/watch\(\s*\(\) => feed\.phase\.value,/);
    expect(cal).toMatch(/keepBtn\.value\?\.focus\(\)/);
    expect(cal).toMatch(/resetBtn\.value\?\.focus\(\)/);
  });
  it('Delete everything\'s confirm: focus on "No"; back on Delete after No', () => {
    expect(sync).toMatch(/ref="noBtn"/);
    expect(sync).toMatch(/ref="deleteBtn"/);
    expect(sync).toMatch(/watch\(\s*\(\) => forget\.phase\.value,/);
    expect(sync).toMatch(/noBtn\.value\?\.focus\(\)/);
    expect(sync).toMatch(/deleteBtn\.value\?\.focus\(\)/);
  });
});
