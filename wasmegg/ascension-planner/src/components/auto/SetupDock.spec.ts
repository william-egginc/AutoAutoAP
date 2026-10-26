/**
 * The floating Setup pill (SetupDock.vue) at 1280 px (UX review 26 Oct 2026, #18): it sat over the right edge of
 * the Auto Planner's column (and "Every number of ascensions ›"). From xl it stacks into a 10rem pill that fits in
 * the margin. Rendered on the server with a stand-in window.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import SetupDock from './SetupDock.vue';

const g = globalThis as { window?: unknown };
let had: unknown;
beforeAll(() => {
  had = g.window;
  g.window = { innerWidth: 1280, innerHeight: 900, addEventListener: () => {}, removeEventListener: () => {} };
});
afterAll(() => {
  g.window = had;
});

const pill = (html: string) => html.match(/<div[^>]*data-testid="setup-dock-pill"[^>]*>/)?.[0] ?? '';

describe('the Setup pill at 1280', () => {
  it('stacks from xl on the Auto Planner: 10rem wide, Setup over the workers', async () => {
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'fastest' }, {}, [p]);
    const tag = pill(html);
    for (const c of ['xl:w-40', 'xl:flex-wrap', 'xl:justify-center']) expect(tag).toContain(c);
    // The row break between Setup and the workers, and the divider gone, from xl only.
    expect(html).toContain('class="hidden xl:block basis-full h-0"');
    expect(html).toMatch(/class="[^"]*\bw-px h-5 bg-white\/30\b[^"]*"/);
    expect(html.match(/<span class="([^"]*)"[^>]*><\/span><span class="hidden xl:block/)?.[1].split(" ")).toContain("xl:hidden");
    // Phones keep the one-row pill (the page's 6rem room under it is sized for that).
    expect(tag).toContain('flex items-center gap-1 rounded-full bg-indigo-600');
  });

  it('fits right of the 56rem column at 1280 (with or without a 15 px scrollbar), 1rem from the edge', () => {
    const src = readFileSync('src/components/auto/SetupDock.vue', 'utf8');
    expect(src).toContain("right: '1rem'");
    for (const f of ['ByDateScreen.vue', 'FastestRoute.vue']) expect(readFileSync(`src/components/auto/${f}`, 'utf8')).toContain('max-w-4xl mx-auto');
    for (const w of [1280, 1280 - 15]) {
      const columnRight = (w + 56 * 16) / 2;
      const pillLeft = w - 16 - 10 * 16;
      expect(pillLeft).toBeGreaterThan(columnRight);
    }
  });

  it('My runs keeps the one-row pill (its summary line needs the width)', async () => {
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'fastest', summary: '7 am–11 pm · no time off' }, {}, [p]);
    expect(pill(html)).not.toContain('xl:w-40');
    expect(html).not.toContain('basis-full');
  });
});
