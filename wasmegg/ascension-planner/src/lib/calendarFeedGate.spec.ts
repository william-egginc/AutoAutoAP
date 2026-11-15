/**
 * THE CALENDAR FEED'S WORDS BEHIND THE FLAG (14 Nov 2026): the flag is one line (lib/calendarFlag.ts CALENDAR_FEED_DEFAULT; a
 * QA build forces it with VITE_CALENDAR_FEED=1 or 0). While it is off, beta's collector (the live one) has no /cal, so nothing
 * that describes the feed ships: the Setup card (lib/calendarFeedFlag.spec.ts), the "?" tip's calendar line, About's calendar
 * blocks (the build strips what sits between calendar-feed:begin and calendar-feed:end) and the release note.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CALENDAR_FEED_DEFAULT, calendarFeedOn } from './calendarFlag';
import { applyCalendarFeed, CALENDAR_NOTE_PREFIX, releaseHistoryFor } from './aboutBuild';
import { PRIVACY_TIP_CALENDAR_LINE, PRIVACY_TIP_LINES } from './privacyWords';
import { CALENDAR_FEED } from './calendarCloud';
import { renderHtml, textOf } from '@/test/renderComponent';
import PrivacyTip from '@/components/PrivacyTip.vue';

const about = readFileSync(new URL('../../public/about.html', import.meta.url), 'utf8');

describe('the one flag', () => {
  it('off in the repo; VITE_CALENDAR_FEED forces it either way', () => {
    expect(CALENDAR_FEED_DEFAULT).toBe(false);
    expect(calendarFeedOn(undefined)).toBe(false);
    expect(calendarFeedOn('')).toBe(false);
    expect(calendarFeedOn('1')).toBe(true);
    expect(calendarFeedOn('0')).toBe(false);
  });
  it('the app and the build read the same line', () => {
    expect(readFileSync(new URL('./calendarCloud.ts', import.meta.url), 'utf8')).toContain('export const CALENDAR_FEED = { enabled: calendarFeedOn(import.meta.env.VITE_CALENDAR_FEED) };');
    expect(readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')).toContain('calendarFeedOn(');
  });
});

describe('About: the calendar blocks go with the flag', () => {
  const sections = (h: string) => [...h.matchAll(/<section id="([^"]+)">\s*<h2>([^<]+)<\/h2>/g)].map(m => ({ id: m[1], title: m[2] }));
  const links = (h: string) => {
    const at = h.indexOf('<nav class="contents" aria-label="Contents">');
    return [...h.slice(at, h.indexOf('</nav>', at)).matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map(m => ({ id: m[1], title: m[2] }));
  };
  it('the source has five marked blocks (the section, its contents link, a sentence in What is sent, a bullet in What goes online, a row in the storage table), each begin matched by an end', () => {
    expect(about.match(/<!-- calendar-feed:begin -->/g)).toHaveLength(5);
    expect(about.match(/<!-- calendar-feed:end -->/g)).toHaveLength(5);
  });
  it('off: no calendar anywhere, 18 sections and a link for each, no marker left', () => {
    const off = applyCalendarFeed(about, false);
    expect(off).not.toMatch(/calendar/i);
    expect(off).not.toContain('calendar-feed:');
    expect(sections(off)).toHaveLength(18);
    expect(links(off)).toEqual(sections(off));
    // The rest of the page is as it was: only the marked blocks went.
    expect(off.length).toBeLessThan(about.length);
    expect(off).toContain('<h2>What stays on your computer</h2>');
  });
  it('on: the calendar section and its link, 19 sections, the markers dropped', () => {
    const on = applyCalendarFeed(about, true);
    expect(on).toContain('Your calendar link');
    expect(on).not.toContain('calendar-feed:');
    expect(sections(on)).toHaveLength(19);
    expect(links(on)).toEqual(sections(on));
  });
  it('an unmatched begin is left alone rather than eating the page', () => {
    const odd = 'a <!-- calendar-feed:begin --> b';
    expect(applyCalendarFeed(odd, false)).toBe(odd);
  });
  it('the build strips it: vite.config.ts has a build-only plugin that rewrites dist/about.html', () => {
    const cfg = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(cfg).toContain("name: 'aap-calendar-about'");
    expect(cfg).toContain('applyCalendarFeed(');
  });
});

describe('the "?" tip: the calendar line only while the flag is on', () => {
  beforeEach(() => {
    CALENDAR_FEED.enabled = false;
  });
  afterEach(() => {
    CALENDAR_FEED.enabled = false;
  });
  it('off: the usual lines, not the calendar one', async () => {
    const t = textOf(await renderHtml(PrivacyTip));
    for (const l of PRIVACY_TIP_LINES) expect(t).toContain(l.slice(0, 40));
    expect(t).not.toContain(PRIVACY_TIP_CALENDAR_LINE.slice(0, 40));
  });
  it('on: the same lines and the calendar line at the end', async () => {
    CALENDAR_FEED.enabled = true;
    const t = textOf(await renderHtml(PrivacyTip));
    expect(t).toContain(PRIVACY_TIP_CALENDAR_LINE.slice(0, 40));
    expect(t.indexOf(PRIVACY_TIP_CALENDAR_LINE.slice(0, 40))).toBeGreaterThan(t.indexOf(PRIVACY_TIP_LINES[PRIVACY_TIP_LINES.length - 1].slice(0, 40)));
  });
});

describe('the release note: only while the flag is on', () => {
  const hist = [
    { at: '2026-11-14T22:00:00Z', note: `${CALENDAR_NOTE_PREFIX} (Setup, off to start): a private link` },
    { at: '2026-11-13T22:00:03Z', note: 'Build-up tracker stages' },
  ];
  it('off: dropped (a tab is never told of a feature the build does not have)', () => {
    expect(releaseHistoryFor(hist, false).map(h => h.at)).toEqual(['2026-11-13T22:00:03Z']);
  });
  it('on: kept, newest first as it was', () => {
    expect(releaseHistoryFor(hist, true)).toEqual(hist);
  });
  it('the real release.ts has it, and its prefix is what the filter matches', async () => {
    const release = (await import('../../release')).default;
    expect(release.history.some(h => h.note.startsWith(CALENDAR_NOTE_PREFIX))).toBe(true);
    expect(releaseHistoryFor(release.history, false).some(h => h.note.startsWith(CALENDAR_NOTE_PREFIX))).toBe(false);
  });
  it('vite.config.ts builds version.json and the build notes from the filtered list', () => {
    const cfg = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(cfg).toContain('releaseHistoryFor(release.history');
    expect(cfg).not.toMatch(/versionHistory\(release\.history\)/);
    expect(cfg).not.toMatch(/buildNoteKeys\(release\.history\)/);
  });
});
