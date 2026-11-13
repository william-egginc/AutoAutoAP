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
    // The same bar on all three (Jordan, 13 Nov 2026): the name above a centred Change player.
    expect(tpl).toContain('<SaveLine v-if="saveLineShown" />');
    expect(tpl).toContain('<div v-if="playerId && !saveLineShown" class="flex justify-center mt-2" data-testid="header-toggle">');
    expect(app).toContain("(plannerTab.value === 'myruns' || (plannerTab.value === 'automatic' && autoView.value !== 'classic'))");
  });
  it("Fastest and By a date: the save strip and the silo line in the screen's own column, never wider (Jordan's 1740 px shot, 12 Nov 2026)", () => {
    // App's wrapper is max-w-6xl (72rem); both screens draw in max-w-4xl (56rem), centred. In the wrapper the strip
    // started up to 8rem left of the screen's content and ran off a crop of the page. Same column as the screens.
    const tag = tpl.slice(tpl.indexOf('<SaveSide'), tpl.indexOf('/>', tpl.indexOf('<SaveSide')));
    expect(tag).toContain("plannerTab !== 'myruns'");
    expect(tag).toMatch(/class="[^"]*\bmax-w-4xl mx-auto\b/);
    for (const f of ['components/auto/FastestRoute.vue', 'components/auto/ByDateScreen.vue']) {
      const t = read(f).replace(/<!--[\s\S]*?-->/g, '');
      expect(t.slice(t.indexOf('<template>'), t.indexOf('<template>') + 80), f).toMatch(/<template>\s*<div class="max-w-4xl mx-auto\b/);
    }
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
  it('whose save, the name only (no TE; Jordan, 13 Nov 2026), right above the switch-account button (Change player, Close player box while the box is open: layoutContract.saveline.spec.ts); the save age is layout/SaveSide.vue', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().nickname = 'Williamthe5thc';
    useUIStore().isHeaderCollapsed = true;
    const html = await renderHtml(SaveLine, {}, {}, [pinia]);
    expect(html).toContain('data-region="save-line"');
    const who = html.match(/<[^>]*data-testid="save-line-who"[^>]*>[\s\S]*?<\/span>/)?.[0] ?? '';
    expect(textOf(who)).toBe('Williamthe5thc');
    expect(textOf(html)).not.toContain('TE');
    // Inside Change player since 12 Nov 2026 (Jordan): the button holds the name, nothing above it.
    expect(html.indexOf('save-line-switch')).toBeLessThan(html.indexOf('save-line-who'));
    expect(textOf(html)).toBe('Williamthe5thc');
    // The save age left the bar (12 Nov 2026): layout/SaveSide.vue, under it on Fastest and By a date (saveSide.spec.ts).
    expect(html).not.toContain('data-testid="save-line-age"');
    expect(html).toContain('data-testid="save-line-switch"');
    useUIStore().isHeaderCollapsed = false;
    expect(await renderHtml(SaveLine, {}, {}, [pinia])).toContain('aria-expanded="true"');
  });
});
