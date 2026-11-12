/**
 * THE LAYOUT CONTRACT in App.vue (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the top tabs
 * with My runs always in them (Q5), then the save line in the chevron's place on Fastest, By a date and My runs (Q6),
 * then the goal tabs, the screen, the footer. The ID box stays reachable: Setup's Change player opens and focuses it,
 * the first visit shows it as before, and the save line's Close folds it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { myRunsTab } from '@/lib/myRunsShown';
import SaveLine from './SaveLine.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const app = read('App.vue');
const tpl = app.slice(0, app.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');

describe('App: the regions in their fixed order', () => {
  it('top tabs, the save line, the goal tabs, the screens, the footer', () => {
    const at = ['<SiteTabs', '<SaveLine', 'aria-label="Site"', '<FastestRoute', '<MyRunsView', 'data-testid="site-footer"'].map(m => tpl.indexOf(m));
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('the save line in place of the chevron on Fastest, By a date and My runs; the chevron stays elsewhere', () => {
    expect(tpl).toContain('<SaveLine v-if="saveLineShown" />');
    expect(tpl).toContain('<div v-if="playerId && !saveLineShown" class="flex justify-center mt-2" data-testid="header-toggle">');
    expect(app).toContain("(plannerTab.value === 'myruns' || (plannerTab.value === 'automatic' && autoView.value !== 'classic'))");
  });
  it('My runs is always in the top tabs, whatever the account has', () => {
    for (const content of ['none', 'unknown', 'some'] as const) expect(myRunsTab({ content, running: false, onIt: false }).shown).toBe(true);
  });
  it('Change player is in Setup: it opens the ID box and focuses it', () => {
    const setup = read('components/auto/YourSetup.vue');
    expect(setup).toContain('data-testid="setup-change-player"');
    const fn = setup.slice(setup.indexOf('function changePlayer'), setup.indexOf('\n}', setup.indexOf('function changePlayer')));
    expect(fn).toContain('ui.isHeaderCollapsed = false;');
    expect(fn).toContain("document.getElementById('playerId')");
    expect(fn).toContain('box?.focus();');
  });
});

describe('the save line', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('whose save and its TE (the save age is layout/SaveSide.vue since 12 Nov 2026); the switch-account button always on it (Change player, Close player box while the box is open: layoutContract.saveline.spec.ts)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().nickname = 'Williamthe5thc';
    useUIStore().isHeaderCollapsed = true;
    const html = await renderHtml(SaveLine, {}, {}, [pinia]);
    expect(html).toContain('data-region="save-line"');
    expect(textOf(html)).toContain('Williamthe5thc ·');
    // The save age left the bar (12 Nov 2026): layout/SaveSide.vue, under it on Fastest and By a date (saveSide.spec.ts).
    expect(html).not.toContain('data-testid="save-line-age"');
    expect(html).toContain('data-testid="save-line-switch"');
    useUIStore().isHeaderCollapsed = false;
    expect(await renderHtml(SaveLine, {}, {}, [pinia])).toContain('aria-expanded="true"');
  });
});
