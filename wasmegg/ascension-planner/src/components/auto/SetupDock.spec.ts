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
    // Phones keep the one-row pill (the page's 6rem room under it is sized for that); below about 313 px it wraps
    // (SetupDock.narrow.spec.ts).
    expect(tag).toContain('flex flex-wrap items-center justify-center gap-1 rounded-[1.75rem] bg-indigo-600');
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

  it('My runs keeps the full pill at xl: Setup, the summary line, the divider and − workers +, nothing hidden', async () => {
    const p = createPinia();
    setActivePinia(p);
    const summary = '7 AM–11 PM · time off Oct 29–30 · no prestige Oct 27';
    const html = await renderHtml(SetupDock, { screen: 'fastest', summary }, {}, [p]);
    // Nothing on it hides at any width (Jordan, 26 Oct 2026: players turn the workers down mid-run); only the divider,
    // below 320 px, where the workers wrap to a second row (ux32-b).
    expect(html).not.toContain('xl:hidden');
    expect(html).toContain('>Setup</span>');
    expect(html).toContain(summary);
    expect(html).toMatch(/class="w-px h-5 bg-white\/30 max-\[319px\]:hidden"/);
    for (const w of ['Fewer workers', 'More workers', 'Drag to move']) expect(html).toContain(w);
    expect(html).toMatch(/\d+\/\d+ workers/);
    // One row, not the Auto Planner's stacked 10rem pill; from xl at most 27rem wide, its summary wrapping at 13rem.
    const tag = pill(html);
    expect(tag).not.toContain('xl:w-40');
    expect(tag).toContain('xl:flex-nowrap');
    expect(html).not.toContain('basis-full');
    expect(tag).toContain('xl:max-w-[27rem]');
    expect(html).toMatch(/data-testid="setup-dock-summary"/);
    expect(html.match(/<span[^>]*data-testid="setup-dock-summary"[^>]*>/)?.[0]).toContain('xl:max-w-[13rem]');
  });

  it('phones keep the one-row pill (wrapping only when it does not fit) with its 44 px tap targets', async () => {
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'fastest', summary: '7 AM–11 PM · no time off' }, {}, [p]);
    expect(pill(html)).toContain('flex flex-wrap items-center justify-center gap-1 rounded-[1.75rem] bg-indigo-600');
    expect((html.match(/w-11 h-11 sm:w-6 sm:h-6/g) ?? []).length).toBe(2);
    expect(html).toContain('min-h-[44px] sm:min-h-0 rounded-full px-2.5');
  });

  it('My runs keeps full width at xl: no right padding class; bottom padding stays', () => {
    const app = readFileSync('src/App.vue', 'utf8');
    // The pill floats over the page like any floating button (orchestrator, 26 Oct 2026: a 28rem right padding left
    // an empty right half at 1280, worse than the overlap).
    expect(app).not.toMatch(/xl:pr-\[/);
    expect(app).toContain('<div class="max-w-6xl mx-auto p-4">');
    expect(app).toContain('<div v-else-if="plannerTab === \'myruns\'" class="max-w-6xl mx-auto mt-6">');
    // The room under the page for the pill, on My runs too.
    expect(app).toContain(":style=\"setupDockShown ? { paddingBottom: pageBottomRoom } : undefined\"");
    expect(app).toContain("(plannerTab.value === 'automatic' || plannerTab.value === 'myruns') && !!playerId.value && !loading.value");
    expect(app).toContain("const SETUP_DOCK_CLEARANCE = 'calc(env(safe-area-inset-bottom, 0px) + 6rem)';");
  });
});
