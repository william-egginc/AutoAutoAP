/**
 * Single run (the 'classic' Auto Planner screen, Joo's planner) has a fixed bar of totals at the bottom
 * (ChainSummaryBar.vue) with its fold tab 2rem above it. The floating Setup pill sat over that bar's right end and
 * was cut off (Jordan, 27 Oct 2026). On that screen App.vue measures the bar (useBottomBarRoom) and passes its room
 * as bottomOffset: the pill sits 1rem above it, and a dragged pill is kept above it too.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import SetupDock from './SetupDock.vue';
import { barRoom, SINGLE_RUN_BAR } from '@/composables/useBottomBarRoom';

const g = globalThis as { window?: unknown; localStorage?: unknown };
let had: unknown;
let hadLs: unknown;
const store = new Map<string, string>();
beforeAll(() => {
  had = g.window;
  hadLs = g.localStorage;
  g.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {}, removeEventListener: () => {} };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
});
afterAll(() => {
  g.window = had;
  g.localStorage = hadLs;
});

const dockTag = (html: string) => html.match(/<div[^>]*class="fixed z-50"[^>]*>/)?.[0] ?? '';

describe('the Setup pill on Single run', () => {
  it('sits 1rem above the bottom bar it is given', async () => {
    store.clear();
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'classic', bottomOffset: 150 }, {}, [p]);
    expect(dockTag(html)).toContain('bottom:calc(env(safe-area-inset-bottom, 0px) + 150px + 1rem)');
  });

  it('other screens keep 1rem from the bottom', async () => {
    store.clear();
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'fastest' }, {}, [p]);
    expect(dockTag(html)).toContain('bottom:calc(env(safe-area-inset-bottom, 0px) + 1rem)');
  });

  it('a pill dragged to the bottom is kept above the bar, inside the window', async () => {
    store.clear();
    store.set('aap-setup-dock-pos', JSON.stringify({ x: 100, y: 820 }));
    const p = createPinia();
    setActivePinia(p);
    const html = await renderHtml(SetupDock, { screen: 'classic', bottomOffset: 150 }, {}, [p]);
    // 844 tall window, 44 px pill (the stand-in height before it is measured), 4 px margin, 150 px bar room.
    expect(dockTag(html)).toContain(`top:${844 - 44 - 4 - 150}px`);
    // And one dragged above the bar stays where it was left.
    store.set('aap-setup-dock-pos', JSON.stringify({ x: 100, y: 300 }));
    const html2 = await renderHtml(SetupDock, { screen: 'classic', bottomOffset: 150 }, {}, [p]);
    expect(dockTag(html2)).toContain('top:300px');
  });

  it("the bar's room: what shows of it above the window's bottom, plus its 2rem fold tab", () => {
    // Open: the bar's top 120 px up from the bottom of an 844 px window.
    expect(barRoom({ top: 724 } as DOMRect, 844)).toBe(120 + 32);
    // Folded (slid down out of the window): only the tab.
    expect(barRoom({ top: 844 } as DOMRect, 844)).toBe(32);
    // No bar (no plan yet): nothing.
    expect(barRoom(null, 844)).toBe(0);
  });

  it('App.vue gives the pill the bar room on Single run only; the bar carries the marker class', () => {
    const app = readFileSync('src/App.vue', 'utf8');
    expect(app).toMatch(
      /<SetupDock v-if="plannerTab === 'automatic' && playerId && !loading" :screen="autoView" :bottom-offset="singleRunBarRoom" \/>/
    );
    expect(app).toContain(
      "useBottomBarRoom(computed(() => setupDockShown.value && plannerTab.value === 'automatic' && autoView.value === 'classic'))"
    );
    // The page's room under its content grows by the bar's, so its last lines scroll clear of the bar and the pill.
    expect(app).toContain('? `calc(env(safe-area-inset-bottom, 0px) + 6rem + ${singleRunBarRoom.value}px)`');
    const bar = readFileSync('src/components/auto/ChainSummaryBar.vue', 'utf8');
    expect(bar).toContain(`class="${SINGLE_RUN_BAR} fixed bottom-0 left-0 right-0`);
  });
});
