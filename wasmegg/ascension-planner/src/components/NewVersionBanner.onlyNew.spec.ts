/**
 * Red team R7 M1 (1 Nov 2026): on a phone the update banner was 714 of 852 px tall. Jordan: "only the ones that are
 * new". The banner lists ONLY the notes new to this tab, at most three, newest first, then "+N more" counting new
 * notes only; the notes the tab already has are not listed at all. The reload words are one short sentence, and on
 * the small level Dismiss is the primary button. Through releaseFrom() with fixture notes, fixed build times and a
 * pinned zone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseFrom, type ReleaseInfo } from '@/composables/useNewVersion';
import type { RunningBuild } from '@/lib/updateNotes';
import { renderHtml, textOf as blockText } from '@/test/renderComponent';

const textOf = (html: string) => blockText(html.replace(/<\/?span[^>]*>/g, ''));

const state = { available: ref(true), release: ref<ReleaseInfo>({ level: 'small', notes: [], more: 0 }) };
vi.mock('@/composables/useNewVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useNewVersion')>()),
  useNewVersion: () => ({ available: state.available, release: state.release, check: async () => undefined }),
}));
vi.mock('@/lib/updateNotes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/updateNotes')>()),
  localZone: () => 'America/Los_Angeles',
}));
const { default: NewVersionBanner } = await import('./NewVersionBanner.vue');

/** Seven notes, one a day at noon UTC, newest (n7, 27 Oct) first as release.ts keeps them. */
const SEVEN = [7, 6, 5, 4, 3, 2, 1].map(d => ({ at: `2026-10-2${d}T12:00:00Z`, note: `note ${d}` }));
/** A tab built on 23 Oct in the evening: n7, n6, n5, n4 are new to it; n3, n2, n1 it already has. */
const FOUR_NEW: RunningBuild = { builtAt: '2026-10-23T18:00:00Z', noteAts: [] };
const versionJson = (history: unknown[], reloadIfBuiltBefore = '2026-10-01T00:00:00Z') => ({
  index: 'assets/index-b.js',
  release: { reloadIfBuiltBefore, note: '', history },
});
const render = async (history: unknown[], running: RunningBuild = FOUR_NEW, rib?: string) => {
  state.release.value = releaseFrom(versionJson(history, rib), running);
  return renderHtml(NewVersionBanner, {
    pageUrl: './',
    entry: 'index',
    note: 'save your results first; a running search stops at the reload',
  });
};
const items = (html: string) =>
  [...html.matchAll(/<li[^>]*data-testid="update-note"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]));

describe('NewVersionBanner (R7 M1): only the notes new to this tab, at most three', () => {
  beforeEach(() => {
    state.available.value = true;
  });

  it('7 notes, 4 new: the 3 newest listed, each tagged New, "+1 more", no carried note', async () => {
    const html = await render(SEVEN);
    expect(html).toContain('data-testid="update-banner-small"');
    expect(items(html)).toEqual(['Oct 27 New note 7', 'Oct 26 New note 6', 'Oct 25 New note 5']);
    expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(3);
    const text = textOf(html);
    expect(text).toContain('+1 more');
    for (const carried of ['note 3', 'note 2', 'note 1']) expect(text).not.toContain(carried);
    // The 4th new note is the one counted in "+1 more", not listed.
    expect(text).not.toContain('note 4');
  });

  it('exactly 3 new: all listed, no "+N more" (the carried ones are not counted)', async () => {
    const html = await render(SEVEN, { builtAt: '2026-10-24T18:00:00Z', noteAts: [] });
    expect(items(html)).toEqual(['Oct 27 New note 7', 'Oct 26 New note 6', 'Oct 25 New note 5']);
    expect(textOf(html)).not.toContain('more');
  });

  it('1 new of 7: only that one, nothing else', async () => {
    const html = await render(SEVEN, { builtAt: '2026-10-26T18:00:00Z', noteAts: [] });
    expect(items(html)).toEqual(['Oct 27 New note 7']);
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it('0 new: no banner', async () => {
    const html = await render(SEVEN, { builtAt: '2026-10-28T00:00:00Z', noteAts: [] });
    expect(html).not.toContain('data-testid="update-banner');
    expect(textOf(html)).toBe('');
  });

  it('0 new but the tab must reload: the reload ask, without a list', async () => {
    const html = await render(SEVEN, { builtAt: '2026-10-28T00:00:00Z', noteAts: [] }, '2026-10-29T00:00:00Z');
    expect(html).toContain('data-testid="update-banner-essential"');
    expect(html).not.toContain('<li');
  });

  it('big only from a new big note; a carried big note leaves it small', async () => {
    const newBig = SEVEN.map((n, i) => (i === 1 ? { ...n, level: 'big' } : n));
    expect(await render(newBig)).toContain('data-testid="update-banner-big"');
    const oldBig = SEVEN.map((n, i) => (i === 5 ? { ...n, level: 'big' } : n));
    expect(await render(oldBig)).toContain('data-testid="update-banner-small"');
  });

  it('a new big note beyond the three shown still makes it big, and is counted in "+N more"', async () => {
    const html = await render(SEVEN.map((n, i) => (i === 3 ? { ...n, level: 'big' } : n)));
    expect(html).toContain('data-testid="update-banner-big"');
    expect(items(html)).toHaveLength(3);
    expect(textOf(html)).toContain('+1 more');
  });

  it('the small level: one short sentence about reloading, and Dismiss is the primary button', async () => {
    const html = await render(SEVEN);
    const banner = html.match(/data-testid="update-banner-small"[\s\S]*$/)?.[0] ?? '';
    const paras = [...banner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => textOf(m[1]));
    // The heading, then one line about reloading: one sentence, short.
    expect(paras).toHaveLength(2);
    const reloadLine = paras[1];
    expect(reloadLine.split(/[.;]\s/)).toHaveLength(1);
    expect(reloadLine.length).toBeLessThanOrEqual(55);
    expect(banner).not.toContain('Carry on');
    const buttons = [...banner.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m => ({
      cls: m[1],
      text: textOf(m[2]),
    }));
    const dismiss = buttons.find(b => b.text === 'Dismiss');
    const reload = buttons.find(b => b.text === 'Reload anyway');
    expect(dismiss?.cls).toContain('bg-slate-800');
    expect(dismiss?.cls).toContain('text-white');
    expect(reload?.cls).not.toContain('bg-slate-800');
    expect(reload?.cls).not.toContain('text-white');
    // The primary button last (on the right), as on the big and essential levels.
    expect(buttons.map(b => b.text)).toEqual(['Reload anyway', 'Dismiss']);
  });

  it('the reload ask: the reason in one sentence (App.vue note one short clause, no multi-line explanation)', async () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
    const note = app.match(/<NewVersionBanner[\s\S]*?\snote="([^"]*)"/)?.[1] ?? '';
    expect(note).not.toBe('');
    expect(note.length).toBeLessThanOrEqual(70);
    expect(note).not.toMatch(/[.()]/);
    const html = await render(SEVEN, FOUR_NEW, '2026-10-29T00:00:00Z');
    expect(textOf(html)).toContain('Please reload: this tab is missing a fix from a newer version.');
  });
});
