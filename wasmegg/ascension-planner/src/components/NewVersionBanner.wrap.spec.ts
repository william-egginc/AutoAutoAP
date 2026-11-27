/**
 * The update banner wraps long notes (red team R7, finding 8: one 200-character word ran past the right edge of the
 * fixed banner, 423 px wide in Safari at a narrow width). Each level's notes list may break anywhere
 * (`[overflow-wrap:anywhere]`, so an unbroken token wraps instead of setting the box's width), and the text column is
 * a flex child that can shrink (`min-w-0`, no fixed minimum width). Words unchanged. The widths themselves are checked
 * in headless Chrome at 300 and 393 px (notes/spec-r7redteam-c.md).
 */
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseInfo } from '@/composables/useNewVersion';
import { renderHtml } from '@/test/renderComponent';

const state = { available: ref(true), release: ref<ReleaseInfo>({ level: 'small', notes: [], more: 0 }) };
vi.mock('@/composables/useNewVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useNewVersion')>()),
  useNewVersion: () => ({ available: state.available, release: state.release, check: async () => undefined }),
}));
const { default: NewVersionBanner } = await import('./NewVersionBanner.vue');

const TOKEN = `https://example.invalid/${'a'.repeat(96)}`; // 120 characters, no break
const LONG =
  'A placeholder note long enough to wrap several times on a phone, about the Build-up tracker and the saved runs list and nothing else';

const render = (level: ReleaseInfo['level']) => {
  state.release.value = {
    level,
    notes: [
      { at: '2026-10-31T12:00:00Z', note: TOKEN, key: 'k1', isNew: true },
      { at: '2026-10-30T12:00:00Z', note: LONG, key: 'k2', isNew: false },
    ],
    more: 0,
  };
  return renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index', note: 'save your results first' });
};

describe.each(['small', 'big', 'essential'] as const)('NewVersionBanner %s: long notes wrap', level => {
  it('the notes list may break anywhere, and the token is there whole', async () => {
    const html = await render(level);
    const ul = html.match(/<ul[^>]*data-testid="update-notes"[^>]*>/)?.[0] ?? '';
    expect(ul).toMatch(/class="[^"]*\[overflow-wrap:anywhere\]/);
    expect(html).toContain(TOKEN);
  });

  it('no fixed minimum width on the text column; it can shrink', async () => {
    const html = await render(level);
    expect(html).not.toMatch(/min-w-\[\d/);
    const banner = html.match(/data-testid="update-banner-[a-z]+"[\s\S]*$/)?.[0] ?? '';
    if (level !== 'small') {
      // The text column: the banner's first flex child.
      const column = banner.match(/<div class="([^"]*)"/)?.[1] ?? '';
      expect(column.split(' ')).toContain('min-w-0');
    }
  });
});
