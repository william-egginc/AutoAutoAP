/** The update banner's words and buttons; the notes list itself (newest first, "New" tags, "+N more") is
 *  NewVersionBanner.history.spec.ts. */
import fs from 'node:fs';
import path from 'node:path';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseInfo } from '@/composables/useNewVersion';
import { renderHtml, textOf as blockText } from '@/test/renderComponent';

/** The visible text, with inline spans joined the way the browser shows them (no space at a span's edge). */
const textOf = (html: string) => blockText(html.replace(/<\/?span[^>]*>/g, ''));

const state = { available: ref(true), release: ref<ReleaseInfo>({ level: 'small', notes: [], more: 0 }) };
vi.mock('@/composables/useNewVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useNewVersion')>()),
  useNewVersion: () => ({ available: state.available, release: state.release, check: async () => undefined }),
}));
const { default: NewVersionBanner } = await import('./NewVersionBanner.vue');

/** A listed note, newer than this tab or not. */
const n = (note: string, isNew = true) => ({ at: '2026-10-27T12:00:00Z', note, key: `k-${note}`, isNew });

const render = (release: ReleaseInfo, note?: string) => {
  state.release.value = release;
  return renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index', ...(note ? { note } : {}) });
};

describe('NewVersionBanner', () => {
  beforeEach(() => {
    state.available.value = true;
  });

  it('a small update with no note new to this tab: no banner at all (R7, 31 Oct 2026)', async () => {
    // Re-timed notes only, or a code-only rebuild: the tab picks up the new code on its next load.
    const html = await render({ level: 'small', notes: [], more: 0 }, 'save your results first');
    expect(html).not.toContain('data-testid="update-banner');
    expect(textOf(html)).toBe('');
  });

  it('notes: listed in the order given, newer ones tagged "New", with "+N more"', async () => {
    const html = await render({ level: 'small', notes: [n('newest.'), n('older', false)], more: 2 });
    expect(html).toContain('data-testid="update-notes"');
    const text = textOf(html);
    expect(text).toMatch(/^Small update available\. \w+ \d+ New newest \w+ \d+ older \+2 more No need to reload now/);
    expect(text).not.toContain('New:');
    expect(html.match(/<li/g)).toHaveLength(3);
  });

  it('no "+N more" when everything fits', async () => {
    expect(textOf(await render({ level: 'small', notes: [n('one')], more: 0 }))).not.toContain('more');
  });

  it('big: "New on the planner" with the list', async () => {
    const html = await render({ level: 'big', notes: [n('a heat map')], more: 0 });
    expect(html).toContain('data-testid="update-banner-big"');
    expect(textOf(html)).toMatch(
      /New on the planner: \w+ \d+ New a heat map You’ll get it next time you open the page/
    );
  });

  it('essential with no notes: the reload ask and Later / Reload, no list', async () => {
    const html = await render({ level: 'essential', notes: [], more: 0 }, 'save your results first');
    expect(html).not.toContain('data-testid="update-notes"');
    const text = textOf(html);
    expect(text).toContain('Please reload: this tab is missing a fix from a newer version. Save your results first.');
    expect(text).not.toContain('Also new');
    expect(text).toContain('Later');
    expect(text).toContain('Reload');
  });

  it('essential with notes: the list straight after the advice (no "Also new:" now that older notes are listed too)', async () => {
    const text = textOf(await render({ level: 'essential', notes: [n('fixes')], more: 0 }, 'save your results first'));
    expect(text).toMatch(/Save your results first\. \w+ \d+ New fixes/);
  });

  it('nothing before a newer build is live', async () => {
    state.available.value = false;
    expect(textOf(await render({ level: 'small', notes: [n('x')], more: 0 }))).toBe('');
  });

  it('every button is 44 px tall on a phone', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'NewVersionBanner.vue'), 'utf8');
    const buttons = [...src.matchAll(/<button[^>]*>/g)].map(m => m[0]);
    expect(buttons).toHaveLength(6);
    for (const b of buttons) expect(b).toContain(':class="TAP"');
    expect(src).toContain("const TAP = 'inline-flex items-center justify-center min-h-[44px] sm:min-h-0'");
  });
});
