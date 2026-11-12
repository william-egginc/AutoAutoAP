/**
 * THE SAVE STRIP OUT OF THE TOP BAR (Jordan, 12 Nov 2026): the save strip and the silo line sat in the top bar
 * (layout/SaveLine.vue) between the player's name and "Change player", too big. The top bar keeps the name and Change
 * player; the strip and the silo line are layout/SaveSide.vue, small (text-small), with the same content: on My runs
 * beside the Right now card from lg, below it on a phone; on Fastest and By a date a small block of its own under the bar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import { useUIStore } from '@/stores/ui';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('the top bar keeps the name and Change player only', () => {
  it('no save strip and no silo line in SaveLine.vue', () => {
    const tpl = tplOf(read('components/layout/SaveLine.vue'));
    expect(tpl).not.toContain('<SaveAgeStrip');
    expect(tpl).not.toContain('<SiloLine');
    expect(tpl).toContain('data-testid="save-line-who"');
    expect(tpl).toContain('data-testid="save-line-switch"');
  });
  it('rendered: no save-age text on the bar', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useUIStore().isHeaderCollapsed = true;
    const { default: SaveLine } = await import('./SaveLine.vue');
    const html = await renderHtml(SaveLine, {}, {}, [pinia]);
    expect(html).not.toContain('data-testid="save-line-age"');
    expect(html).toContain('data-testid="save-line-switch"');
  });
});

describe('SaveSide: the same strip and silo line, small', () => {
  it('the strip keeps its test id, state, Why/Details and Load latest save; small text; the silo line under it', () => {
    const tpl = tplOf(read('components/layout/SaveSide.vue'));
    const strip = tpl.slice(tpl.indexOf('<SaveAgeStrip'), tpl.indexOf('/>', tpl.indexOf('<SaveAgeStrip')));
    for (const part of ['testid="save-line-age"', ':state="state"', ':server="server"', 'slim', 'small', ':load-words="LOAD_LATEST_SAVE"', '@fresh="load"'])
      expect(strip, part).toContain(part);
    expect(tpl.indexOf('<SiloLine')).toBeGreaterThan(tpl.indexOf('<SaveAgeStrip'));
  });
  it('SaveAgeStrip `small`: text-small in place of text-body, nothing else changes', () => {
    const src = read('components/myruns/SaveAgeStrip.vue');
    expect(src).toMatch(/small\s*\?\s*'text-small'\s*:\s*'text-body'/);
  });
  it('rendered with no save: the strip (No save loaded) at text-small', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { default: SaveSide } = await import('./SaveSide.vue');
    const html = await renderHtml(SaveSide, {}, {}, [pinia]);
    const tag = html.match(/<div[^>]*data-testid="save-line-age"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('text-small');
    expect(tag).not.toContain('text-body');
  });
});

describe('where it sits', () => {
  it('My runs: Right now and SaveSide in one grid, the side column from lg (below it on a phone), before the soul-egg line', () => {
    const view = tplOf(read('components/MyRunsView.vue'));
    const grid = view.slice(view.lastIndexOf('<div', view.indexOf('data-testid="now-grid"')), view.indexOf('<SoulEggWarning'));
    expect(grid).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_15rem\]/);
    expect(grid.indexOf('<RightNowCard')).toBeGreaterThan(-1);
    expect(grid.indexOf('<SaveSide')).toBeGreaterThan(grid.indexOf('</RightNowCard>'));
  });
  it('My runs: the save strip shows while the page waits for the save too', () => {
    const view = tplOf(read('components/MyRunsView.vue'));
    expect(view).toMatch(/<SaveSide v-if="!page\.hasSave\.value"/);
  });
  it('App: SaveSide under the bar on Fastest and By a date, not on My runs (it is beside Right now there)', () => {
    const app = read('App.vue');
    const tpl = app.slice(0, app.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');
    expect(tpl).toContain(`<SaveSide v-if="saveLineShown && plannerTab !== 'myruns'"`);
    expect(tpl.indexOf('<SaveSide')).toBeGreaterThan(tpl.indexOf('<SaveLine'));
    expect(tpl.indexOf('<SaveSide')).toBeLessThan(tpl.indexOf('aria-label="Site"'));
  });
});
