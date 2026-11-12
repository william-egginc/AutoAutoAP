/**
 * THE FILTERS BUTTON (Jordan, 12 Nov 2026: "a Filters button that opens Setup, like Joo's page has"): his own ask, so a
 * visible slot, not in More. layout/FiltersButton.vue, the bar's small-button style (Change player's), 44 px at every
 * width, a real button with a name, aria-expanded and aria-haspopup="dialog". It opens the floating Setup
 * (auto/SetupDock.vue's panel, ui.setupOpen). Where (Jordan, 13 Nov 2026, on egg-beta c19f76795, made precise the same
 * day): right ABOVE the instant answer card, on By a date below the date picker and its "N days from your plan start"
 * line, on Fastest in the same spot; not inside the card, not after the Auto Planner tabs, not beside My runs' title. Only where SetupDock is mounted (a player ID). The word is in lib/layoutWords.ts.
 * Side (Jordan, 13 Nov 2026): right-aligned from sm up; LEFT on phones, because the floating Setup pill (fixed,
 * bottom-right) sat over a right-aligned button at 390 px.
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
  it('By a date: right above the instant answer card, below the date picker and its "days from your plan start" line', () => {
    const t = tplOf(read('components/auto/DeadlinePanel.vue'));
    const f = t.indexOf('<FiltersButton');
    expect(f).toBeGreaterThan(t.indexOf('from your plan start.'));
    expect(f).toBeLessThan(t.indexOf('data-testid="section-instant"'));
    expect(t.slice(f, t.indexOf('data-testid="section-instant"'))).not.toMatch(/<(p|section|InstantRoute)\b/);
    expect(t.slice(t.lastIndexOf('<div', f), f)).toContain('<div v-if="initialState.playerId" class="flex justify-start sm:justify-end">');
  });
  it('Fastest: the same spot, right above its instant answer card', () => {
    const t = tplOf(read('components/auto/FastestRoute.vue'));
    const f = t.indexOf('<FiltersButton');
    expect(f).toBeGreaterThan(t.indexOf('<YourSetup'));
    expect(f).toBeLessThan(t.indexOf('data-testid="section-instant"'));
    expect(t.slice(t.lastIndexOf('<div', f), f)).toContain('<div v-if="initialState.playerId" class="flex justify-start sm:justify-end">');
  });
  it('not in the card, not beside the Auto Planner tabs, not beside My runs\' title (one place per screen)', () => {
    expect(tplOf(read('components/auto/InstantRoute.vue'))).not.toContain('<FiltersButton');
    const app = read('App.vue');
    const tpl = app.slice(0, app.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');
    expect(tpl).not.toContain('<FiltersButton');
    expect(app).not.toContain("import FiltersButton");
    const view = read('components/MyRunsView.vue');
    expect(tplOf(view)).not.toContain('<FiltersButton');
    expect(view).not.toContain('import FiltersButton');
  });
});
