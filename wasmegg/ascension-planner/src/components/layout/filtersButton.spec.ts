/**
 * THE FILTERS BUTTON (Jordan, 12 Nov 2026: "a Filters button that opens Setup, like Joo's page has"): his own ask, so a
 * visible slot, not in More. layout/FiltersButton.vue, the bar's small-button style (Change player's), 44 px at every
 * width, a real button with a name, aria-expanded and aria-haspopup="dialog". It opens the floating Setup
 * (auto/SetupDock.vue's panel, ui.setupOpen). Where (Jordan, 13 Nov 2026, on egg-beta c19f76795): ON the instant answer
 * card of Fastest and of By a date, at its top right, as Joo's page has it; no longer after the Auto Planner tabs or
 * beside My runs' title. Only where SetupDock is mounted (a player ID). The word is in lib/layoutWords.ts.
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
  it('the instant answer card (InstantRoute.vue, Fastest and By a date): at the right of its heading row, only with a player ID', () => {
    const t = tplOf(read('components/auto/InstantRoute.vue'));
    const main = t.slice(t.indexOf('<section v-if="!noTable"'), t.indexOf('<InstantPointer'));
    expect(main).toContain('<FiltersButton v-if="initialState.playerId"');
    expect(main.indexOf('<FiltersButton')).toBeGreaterThan(main.indexOf('</h3>'));
    const none = t.slice(t.indexOf('data-testid="instant-no-table"'));
    expect(none.slice(0, none.indexOf('<InstantPointer'))).toContain('<FiltersButton v-if="initialState.playerId"');
    // Both screens draw this card.
    expect(read('components/auto/FastestRoute.vue')).toContain('<InstantRoute');
    expect(read('components/auto/DeadlinePanel.vue')).toContain('<InstantRoute');
  });
  it('not beside the Auto Planner tabs, not beside My runs\' title (one place: the card)', () => {
    const app = read('App.vue');
    const tpl = app.slice(0, app.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');
    expect(tpl).not.toContain('<FiltersButton');
    expect(app).not.toContain("import FiltersButton");
    const view = read('components/MyRunsView.vue');
    expect(tplOf(view)).not.toContain('<FiltersButton');
    expect(view).not.toContain('import FiltersButton');
  });
});
