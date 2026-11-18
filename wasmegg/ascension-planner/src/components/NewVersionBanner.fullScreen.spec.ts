/** The reload ask as a full-screen box (R8.1, 18 Nov 2026): only when this tab's own build is known and older than
 *  release.ts `reloadIfBuiltBefore` (ReleaseInfo.fullScreen). The fallback essential keeps the floating banner.
 *  Components render on the server here (no DOM): the clicks are pinned in the source, and the ten-minute Later is
 *  `snoozeEssential` (composables/useNewVersion.ts), which the component's Later button calls. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import {
  bannerFor,
  ESSENTIAL_LATER_MS,
  snoozeEssential,
  type BannerDismissals,
  type ReleaseInfo,
} from '@/composables/useNewVersion';
import { renderHtml, textOf as blockText } from '@/test/renderComponent';

const textOf = (html: string) => blockText(html.replace(/<\/?span[^>]*>/g, ''));
const state = { available: ref(true), release: ref<ReleaseInfo>({ level: 'essential', notes: [], more: 0 }) };
vi.mock('@/composables/useNewVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useNewVersion')>()),
  useNewVersion: () => ({ available: state.available, release: state.release, check: async () => undefined }),
}));
const { default: NewVersionBanner } = await import('./NewVersionBanner.vue');

const render = (release: ReleaseInfo) => {
  state.available.value = true;
  state.release.value = release;
  return renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index', note: 'save your results first' });
};
const STRICT: ReleaseInfo = {
  level: 'essential',
  notes: [{ at: '2026-10-27T12:00:00Z', note: 'a fix', key: 'k-a', isNew: true }],
  more: 0,
  fullScreen: true,
};
const src = fs.readFileSync(path.resolve(__dirname, 'NewVersionBanner.vue'), 'utf8');

describe('the full-screen reload box', () => {
  it('strict case: a dark backdrop with a modal alertdialog holding the same text, notes and both buttons', async () => {
    const html = await render(STRICT);
    expect(html).toContain('data-testid="update-essential-backdrop"');
    expect(html).toMatch(/data-testid="update-essential-backdrop"[^>]*>/);
    const backdrop = html.match(/<div[^>]*data-testid="update-essential-backdrop"[^>]*>/)![0];
    expect(backdrop).toContain('fixed inset-0');
    expect(backdrop).toMatch(/z-\[(1[1-9]\d\d|[2-9]\d{3,})\]/);
    expect(backdrop).toContain('bg-black/');
    const card = html.match(/<div[^>]*data-testid="update-banner-essential"[^>]*>/)![0];
    expect(card).toContain('role="alertdialog"');
    expect(card).toContain('aria-modal="true"');
    const labelled = card.match(/aria-labelledby="([^"]+)"/)?.[1];
    const described = card.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(labelled).toBeTruthy();
    expect(described).toBeTruthy();
    expect(html).toContain(`id="${labelled}"`);
    expect(html).toContain(`id="${described}"`);
    expect(card).toContain('overflow-y-auto');
    const text = textOf(html);
    expect(text).toContain('Please reload: this tab is missing a fix from a newer version. Save your results first.');
    expect(text).toMatch(/a fix/);
    expect(text).toMatch(/Later\s*Reload$/);
    expect(html).toContain('data-testid="update-notes"');
  });

  it('fallback essential (no fullScreen): the old floating banner, no backdrop, no dialog role', async () => {
    const html = await render({ level: 'essential', notes: [], more: 0 });
    expect(html).not.toContain('update-essential-backdrop');
    expect(html).not.toContain('alertdialog');
    const card = html.match(/<div[^>]*data-testid="update-banner-essential"[^>]*>/)![0];
    expect(card).toContain('role="status"');
    expect(card).toContain('fixed top-3');
    expect(textOf(html)).toContain('Please reload: this tab is missing a fix from a newer version. Save your results first.');
  });

  it('small and big never get the box', async () => {
    const big = await render({ level: 'big', notes: [STRICT.notes[0]], more: 0, fullScreen: true });
    expect(big).not.toContain('update-essential-backdrop');
  });

  it('Later hides it, and it returns after ten minutes', () => {
    vi.useFakeTimers();
    try {
      const d = reactive<BannerDismissals>({ small: false, big: null, essential: false });
      expect(bannerFor(true, STRICT, d)).toBe('essential');
      snoozeEssential(d);
      expect(ESSENTIAL_LATER_MS).toBe(10 * 60 * 1000);
      expect(bannerFor(true, STRICT, d)).toBeNull();
      vi.advanceTimersByTime(ESSENTIAL_LATER_MS - 1);
      expect(bannerFor(true, STRICT, d)).toBeNull();
      vi.advanceTimersByTime(1);
      expect(bannerFor(true, STRICT, d)).toBe('essential');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the box’s buttons: Later calls later(), Reload calls reload(), and the Reload button takes focus when it appears', () => {
    const buttons = [...src.matchAll(/<button[^>]*@click="(later|reload)"[^>]*>/g)].map(m => m[1]);
    expect(buttons.filter(b => b === 'later')).toHaveLength(2);
    expect(buttons.filter(b => b === 'reload')).toHaveLength(4);
    expect(src).toContain('ref="reloadBtn"');
    expect(src).toMatch(/reloadBtn[\s\S]*\.focus\(/);
    expect(src).toContain('window.location.reload()');
  });
});

