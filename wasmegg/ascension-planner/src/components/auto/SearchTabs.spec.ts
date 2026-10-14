/** The two search tabs under the instant answer (SearchTabs.vue; Allan, 14 Oct 2026). Rendered on the
 *  server: a "click" or a key press is the component's own handler called from a mixin. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import SearchTabs from './SearchTabs.vue';
import { textOf } from '@/test/renderComponent';
import { loadSearchTabs, searchTabs } from '@/lib/searchTab';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  loadSearchTabs();
});

const intro = { nearby: 'NEARBY INTRO.', exhaustive: 'EXHAUSTIVE INTRO.' };

async function render(
  props: Record<string, unknown> = {},
  /** Runs against the component's setup state before it renders (a click, a key). */
  act?: (state: Record<string, unknown>) => void
): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(
        SearchTabs,
        { screen: 'fastest', intro, ...props },
        { nearby: () => h('p', 'NEARBY BODY'), exhaustive: () => h('p', 'EXHAUSTIVE BODY') }
      ),
  });
  if (act)
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/SearchTabs.vue')) act(this.$.setupState);
      },
    });
  return renderToString(app);
}

/** The panel's opening tag for a tab. */
const panelTag = (html: string, tab: string) => html.match(new RegExp(`<div[^>]*data-tab="${tab}"[^>]*>`))?.[0] ?? '';
const tabTag = (html: string, tab: string) =>
  html.match(new RegExp(`<button[^>]*data-testid="search-tab-${tab}"[^>]*>`))?.[0] ?? '';

describe('SearchTabs', () => {
  it('renders both panels (both stay mounted), Search nearby shown by default, Exhaustive hidden with display:none', async () => {
    const html = await render();
    const t = textOf(html);
    expect(t).toContain('NEARBY BODY');
    expect(t).toContain('EXHAUSTIVE BODY');
    expect(panelTag(html, 'nearby')).not.toContain('display:none');
    expect(panelTag(html, 'exhaustive')).toContain('display:none');
    expect(t).toMatch(/^Search nearby Exhaustive/);
  });

  it('is an ARIA tablist: tabs say which is selected and which panel they control; panels name their tab', async () => {
    const html = await render();
    expect(html).toMatch(/role="tablist"[^>]*aria-label="How to search"/);
    const near = tabTag(html, 'nearby');
    const exh = tabTag(html, 'exhaustive');
    expect(near).toContain('role="tab"');
    expect(near).toContain('aria-selected="true"');
    expect(near).toContain('tabindex="0"');
    expect(exh).toContain('aria-selected="false"');
    expect(exh).toContain('tabindex="-1"');
    expect(near).toContain('aria-controls="search-panel-fastest-nearby"');
    expect(near).toContain('id="search-tab-fastest-nearby"');
    const panel = panelTag(html, 'exhaustive');
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain('id="search-panel-fastest-exhaustive"');
    expect(panel).toContain('aria-labelledby="search-tab-fastest-exhaustive"');
    expect(panel).toContain('data-search-tab-panel');
    expect(panel).toContain('data-screen="fastest"');
    // Touch-sized tabs.
    expect(near).toContain('min-h-[44px]');
  });

  it('each tab starts with its explanation and a How it works link', async () => {
    const html = await render();
    expect(textOf(html)).toContain('NEARBY INTRO. How it works ›');
    expect(textOf(html)).toContain('EXHAUSTIVE INTRO. How it works ›');
    expect(html.match(/href="#\/science\/how"/g)).toHaveLength(2);
  });

  it('a running search: a dot on its tab and "(running)" for screen readers; none on the other', async () => {
    const html = await render({ running: { exhaustive: true } });
    expect(html).toContain('data-testid="search-tab-running-exhaustive"');
    expect(html).not.toContain('data-testid="search-tab-running-nearby"');
    expect(textOf(html)).toMatch(/Exhaustive \(running\)/);
    expect(html).toMatch(/<span class="search-tab-dot"[^>]*aria-hidden="true"/);
    // CSS only, and still with reduced motion.
    const src = fs.readFileSync(path.join(__dirname, 'SearchTabs.vue'), 'utf8');
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.search-tab-dot\s*\{\s*animation: none;/);
  });

  it('opens on the tab remembered for this screen (and only this screen)', async () => {
    mem.set('aap.searchTab.by-date', 'exhaustive');
    loadSearchTabs();
    const byDate = await render({ screen: 'by-date' });
    expect(panelTag(byDate, 'nearby')).toContain('display:none');
    expect(panelTag(byDate, 'exhaustive')).not.toContain('display:none');
    const fastest = await render({ screen: 'fastest' });
    expect(panelTag(fastest, 'exhaustive')).toContain('display:none');
  });

  it('a click shows the tab and remembers it', async () => {
    const html = await render({}, s => (s.choose as (t: string) => void)('exhaustive'));
    expect(panelTag(html, 'exhaustive')).not.toContain('display:none');
    expect(tabTag(html, 'exhaustive')).toContain('aria-selected="true"');
    expect(mem.get('aap.searchTab.fastest')).toBe('exhaustive');
  });

  it('arrow keys, Home and End move between the tabs', async () => {
    const key = (k: string) => (s: Record<string, unknown>) =>
      (s.onKey as (e: unknown) => void)({ key: k, preventDefault: () => {} });
    await render({}, key('ArrowRight'));
    expect(searchTabs.fastest).toBe('exhaustive');
    await render({}, key('ArrowRight'));
    expect(searchTabs.fastest).toBe('nearby');
    await render({}, key('ArrowLeft'));
    expect(searchTabs.fastest).toBe('exhaustive');
    await render({}, key('Home'));
    expect(searchTabs.fastest).toBe('nearby');
    await render({}, key('End'));
    expect(searchTabs.fastest).toBe('exhaustive');
    await render({}, key('a'));
    expect(searchTabs.fastest).toBe('exhaustive');
  });

  it('switches with v-show, never v-if: a hidden tab keeps its run, watchers and teleport targets', () => {
    const src = fs.readFileSync(path.join(__dirname, 'SearchTabs.vue'), 'utf8');
    const tpl = src.slice(0, src.indexOf('<script'));
    expect(tpl).toContain('v-show="selected === t.id"');
    expect(tpl).not.toMatch(/v-if="selected/);
  });
});
