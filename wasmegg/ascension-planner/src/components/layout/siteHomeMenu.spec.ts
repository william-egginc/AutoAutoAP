/**
 * H1 of the UX review, Jordan's decision (13 Nov 2026): "Lets make the Tabs a little bit bigger to replace the header."
 * The shared dark bar (ui/components/NavBar.vue: home icon + menu) is no longer mounted by App.vue; Home and the menu
 * are layout/SiteHomeMenu.vue, at the left end of the tab row (above it on a phone). The menu opens the shared
 * NavBarSidebar, imported and not edited; NavBar.vue itself is untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('App.vue no longer mounts the dark bar', () => {
  const app = read('App.vue');
  it('no the-nav-bar, no aap-navbar wrapper or its tap-area CSS, no TheNavBar import', () => {
    expect(app).not.toContain('<the-nav-bar');
    expect(app).not.toContain('aap-navbar');
    expect(app).not.toContain("import TheNavBar");
  });
  it('Home and the menu sit in a row with the site tabs, shown with or without an account', () => {
    const tpl = tplOf(app);
    const row = tpl.slice(tpl.lastIndexOf('<div', tpl.indexOf('<SiteHomeMenu')), tpl.indexOf('<SiteTabs'));
    expect(row).toContain('data-testid="site-row"');
    expect(row).toMatch(/flex flex-col[^"]*lg:flex-row/);
    expect(row).not.toContain('v-if');
    expect(tpl.slice(tpl.indexOf('<SiteTabs'), tpl.indexOf('/>', tpl.indexOf('<SiteTabs')))).toContain('v-if="playerId"');
  });
  it('the shared NavBar.vue is untouched: still there, with its own home and menu', () => {
    const bar = fs.readFileSync(path.resolve(__dirname, '../../../../../ui/components/NavBar.vue'), 'utf8');
    expect(bar).toContain('<!-- Home icon -->');
  });
});

describe('SiteHomeMenu', () => {
  it('Home links to the wasmegg home (absolute: the planner is served alone), the menu button opens the sidebar; both 44 px', async () => {
    const { default: C } = await import('./SiteHomeMenu.vue');
    const html = await renderHtml(C);
    expect(html).toContain('href="https://wasmegg-carpet.netlify.app/"');
    expect(html).toContain('aria-label="Home"');
    expect(html).toContain('aria-label="Open the site menu"');
    expect(html).toContain('data-testid="site-home"');
    expect(html).toContain('data-testid="site-menu"');
    expect((html.match(/min-h-\[44px\] min-w-\[44px\]/g) ?? []).length).toBe(2);
    expect(textOf(html)).not.toContain('undefined');
  });
  it('the menu is the shared sidebar, asked for absolute links with the planner marked active', () => {
    const src = read('components/layout/SiteHomeMenu.vue');
    expect(src).toContain("import NavBarSidebar from 'ui/components/NavBarSidebar.vue'");
    const tag = tplOf(src).match(/<NavBarSidebar\b[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('v-model:open="open"');
    expect(tag).toContain('active-entry-id="ascension-planner"');
    expect(tag).toMatch(/\suse-absolute-urls(\s|\/|>)/);
    expect(src).toContain('type="button"');
    expect(src).toContain('@click="open = true"');
  });
});
