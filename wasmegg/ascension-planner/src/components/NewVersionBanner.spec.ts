/** The update banner: a list of only the notes newer than this tab's build, or no list at all (lib/updateNotes.ts). */
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

const render = (release: ReleaseInfo, note?: string) => {
  state.release.value = release;
  return renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index', ...(note ? { note } : {}) });
};

describe('NewVersionBanner', () => {
  beforeEach(() => {
    state.available.value = true;
  });

  it('no newer notes: just "Small update available", no list', async () => {
    const html = await render({ level: 'small', notes: [], more: 0 });
    expect(html).toContain('data-testid="update-banner-small"');
    expect(html).not.toContain('data-testid="update-notes"');
    expect(html).not.toContain('<li');
    const text = textOf(html);
    expect(text).toContain(
      'Small update available. No need to reload now; you will get it next time you open the page.'
    );
    expect(text).not.toContain('New:');
    expect(text).toContain('Dismiss');
    expect(text).toContain('Reload anyway');
  });

  it('newer notes: listed, newest first, with "+N more"', async () => {
    const html = await render({ level: 'small', notes: ['newest.', 'older'], more: 2 });
    expect(html).toContain('data-testid="update-notes"');
    const text = textOf(html);
    expect(text).toContain('Small update available. New: newest older +2 more No need to reload now');
    expect(html.match(/<li/g)).toHaveLength(3);
  });

  it('no "+N more" when everything fits', async () => {
    expect(textOf(await render({ level: 'small', notes: ['one'], more: 0 }))).not.toContain('more');
  });

  it('big: "New on the planner" with the list', async () => {
    const html = await render({ level: 'big', notes: ['a heat map'], more: 0 });
    expect(html).toContain('data-testid="update-banner-big"');
    expect(textOf(html)).toContain('New on the planner: a heat map You’ll get it next time you open the page');
  });

  it('essential with no newer notes: the reload ask and Later / Reload, no list', async () => {
    const html = await render({ level: 'essential', notes: [], more: 0 }, 'save your results first');
    expect(html).not.toContain('data-testid="update-notes"');
    const text = textOf(html);
    expect(text).toContain('Please reload: this tab is missing a fix from a newer version. Save your results first.');
    expect(text).not.toContain('Also new');
    expect(text).toContain('Later');
    expect(text).toContain('Reload');
  });

  it('essential with newer notes: "Also new:" and the list', async () => {
    const text = textOf(await render({ level: 'essential', notes: ['fixes'], more: 0 }, 'save your results first'));
    expect(text).toContain('Save your results first. Also new: fixes');
  });

  it('nothing before a newer build is live', async () => {
    state.available.value = false;
    expect(textOf(await render({ level: 'small', notes: ['x'], more: 0 }))).toBe('');
  });

  it('every button is 44 px tall on a phone', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'NewVersionBanner.vue'), 'utf8');
    const buttons = [...src.matchAll(/<button[^>]*>/g)].map(m => m[0]);
    expect(buttons).toHaveLength(6);
    for (const b of buttons) expect(b).toContain(':class="TAP"');
    expect(src).toContain("const TAP = 'inline-flex items-center justify-center min-h-[44px] sm:min-h-0'");
  });
});
