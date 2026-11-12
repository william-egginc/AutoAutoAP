/**
 * THE FILTERS BUTTON (Jordan, 12 Nov 2026: "a Filters button that opens Setup, like Joo's page has"): his own ask, so a
 * visible slot, not in More. layout/FiltersButton.vue, the bar's small-button style (Change player's), 44 px at every
 * width, a real button with a name, aria-expanded and aria-haspopup="dialog". It opens the floating Setup
 * (auto/SetupDock.vue's panel, ui.setupOpen). After the Auto Planner tabs and beside My runs' title, only where
 * SetupDock is mounted. The word is in lib/layoutWords.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useUIStore } from '@/stores/ui';
import { FILTERS } from '@/lib/layoutWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('the button', () => {
  it('Jordan\'s word, in a *Words.ts file', () => {
    expect(FILTERS).toBe('Filters');
  });
  it('a real button, named Filters, 44 px at every width, focus ring, aria-expanded and aria-haspopup', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const { default: FiltersButton } = await import('./FiltersButton.vue');
    let html = await renderHtml(FiltersButton, {}, {}, [pinia]);
    const tag = html.match(/<button[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('type="button"');
    expect(tag).toContain('min-h-[44px]');
    expect(tag).not.toContain('sm:min-h-0');
    expect(tag).toContain('focus-visible:ring-2');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-expanded="false"');
    expect(tag).toContain('data-testid="filters-button"');
    expect(textOf(html)).toBe(FILTERS);
    useUIStore().setupOpen = true;
    html = await renderHtml(FiltersButton, {}, {}, [pinia]);
    expect(html.match(/<button[^>]*>/)?.[0]).toContain('aria-expanded="true"');
  });
  it('the bar\'s small-button style (Change player), and it opens or closes Setup like the pill', () => {
    const src = read('components/layout/FiltersButton.vue');
    for (const c of ['rounded-lg', 'border-slate-300', 'bg-white', 'text-body', 'font-bold', 'text-slate-700']) expect(src, c).toContain(c);
    expect(src).toContain('@click="ui.setupOpen = !ui.setupOpen"');
  });
});

describe('where it sits', () => {
  it('App: after the Auto Planner tabs, only when Setup is there (playerId and not loading)', () => {
    const app = read('App.vue');
    const tpl = app.slice(0, app.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');
    const nav = tpl.slice(tpl.indexOf('aria-label="Site"'), tpl.indexOf("v-else-if=\"plannerTab === 'science'\"", tpl.indexOf('aria-label="Site"')));
    expect(nav).toContain('<FiltersButton v-if="!loading"');
    expect(nav.indexOf('<FiltersButton')).toBeGreaterThan(nav.indexOf('v-for="v in autoTabs"'));
  });
  it('My runs: beside the title, only when Setup is there', () => {
    const view = tplOf(read('components/MyRunsView.vue'));
    const title = view.slice(view.indexOf('data-region="title"'), view.indexOf('<TeOverrideBanner'));
    expect(title).toContain('<FiltersButton v-if="playerId && !loading"');
  });
});
