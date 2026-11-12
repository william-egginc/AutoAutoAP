/** The egg-beta timed-reload banner's words, button and wrapping (the timing itself: lib/eggBetaReload.spec.ts). */
import fs from 'node:fs';
import path from 'node:path';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EggBetaState } from '@/lib/eggBetaReload';
import { renderHtml, textOf as blockText } from '@/test/renderComponent';

const textOf = (html: string) => blockText(html.replace(/<\/?span[^>]*>/g, ''));
const state = ref<EggBetaState>({ kind: 'none' });
vi.mock('@/composables/useEggBetaReload', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useEggBetaReload')>()),
  useEggBetaReload: () => ({ state }),
}));
const { default: Banner } = await import('./EggBetaReloadBanner.vue');
const { reloadPage } = await import('@/composables/useEggBetaReload');

const RELOAD_AT = '2026-11-01T22:00:00.000Z';
const render = (s: EggBetaState, busy = false) => {
  state.value = s;
  return renderHtml(Banner, { busy });
};

describe('EggBetaReloadBanner', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('countdown: 2:00 PM Pacific, the time left, Reload now', async () => {
    const html = await render({ kind: 'countdown', reloadAt: RELOAD_AT, msLeft: 72 * 60_000 });
    expect(html).toContain('role="status"');
    expect(textOf(html)).toBe(
      'This page will reload at 2:00 PM Pacific to get the latest version (save your results first). Reloads in 1h 12m. Reload now'
    );
    expect(html).toMatch(/<span class="tabular-nums" data-testid="eggbeta-countdown">1h 12m<\/span>/);
  });

  it('the last minute counts seconds', async () => {
    const html = await render({ kind: 'countdown', reloadAt: RELOAD_AT, msLeft: 42_000 });
    expect(textOf(html)).toContain('Reloads in 42s.');
  });

  it('a search running during the countdown: says it waits for the search', async () => {
    const html = await render({ kind: 'countdown', reloadAt: RELOAD_AT, msLeft: 60 * 60_000 }, true);
    expect(textOf(html)).toContain('Reloads in 1h. A search is running, so it will reload when your search ends.');
  });

  it('waiting at the deadline: it will reload when your search ends', async () => {
    const html = await render({ kind: 'waiting', reloadAt: RELOAD_AT });
    expect(textOf(html)).toBe(
      'This page will reload to get the latest version (save your results first): it will reload when your search ends. Reload now'
    );
  });

  it('none or reload: nothing', async () => {
    expect(textOf(await render({ kind: 'none' }))).toBe('');
    expect(textOf(await render({ kind: 'reload', reloadAt: RELOAD_AT }))).toBe('');
  });

  it('Reload now is 44 px and reloads the page; the text wraps at any width; type scale', async () => {
    const html = await render({ kind: 'countdown', reloadAt: RELOAD_AT, msLeft: 60_000 });
    const button = html.match(/<button[^>]*data-testid="eggbeta-reload-now"[^>]*>/)?.[0] ?? '';
    expect(button).toMatch(/min-h-\[44px\]/);
    expect(button).not.toMatch(/sm:min-h-0/);
    expect(html).toMatch(/class="min-w-0 [^"]*\[overflow-wrap:anywhere\]/);
    const src = fs.readFileSync(path.join(__dirname, 'EggBetaReloadBanner.vue'), 'utf8');
    expect(src).toMatch(/@click="reload"/);
    expect(src).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    const spy = vi.fn();
    vi.stubGlobal('window', { location: { reload: spy } });
    reloadPage();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('App.vue: compiled in only for an egg-beta build, waits for searches, hides the reload ask while it shows', () => {
    const app = fs.readFileSync(path.join(__dirname, '../App.vue'), 'utf8');
    expect(app).toMatch(
      /const EggBetaReloadBanner = __AAP_EGG_BETA_RELOAD__\s*\?\s*defineAsyncComponent\(\(\) => import\('@\/components\/EggBetaReloadBanner\.vue'\)\)\s*:\s*null;/
    );
    expect(app).toMatch(/const eggBetaBusy = computed\(\(\) => myRunsRunning\.value \|\| chainSearchStore\.resultSending\);/);
    expect(app).toMatch(/<div v-show="!eggBetaActive">\s*<NewVersionBanner/);
    expect(app).not.toMatch(/import [^;]*eggBetaReload/);
    const vitestConfig = fs.readFileSync(path.join(__dirname, '../../vitest.config.ts'), 'utf8');
    expect(vitestConfig).toMatch(/__AAP_EGG_BETA_RELOAD__:\s*'false'/);
  });
});
