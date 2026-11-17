/**
 * The Setup pill on a window 640 to 1280 px wide (Jordan, 17 Nov 2026, about 890 css px on a retina Mac; his Oct test list: "The Setup
 * button shouldn't cover anything"). Measured on a built page: at 1280 px and up the pill sits in the margin beside the 828 px column;
 * below about 1090 it lay over the instant answer. Two rules:
 *  (a) a remembered drag position is forgotten when the window's width has changed by more than 40 px since it was saved (an old entry
 *      with no width is forgotten once), so a spot left at one size cannot sit over the content at another;
 *  (b) from sm to 1279 px the pill is the small round gear at the right edge (My runs included: its hours are one tap away in Setup), and
 *      App.vue keeps a right margin for it so no content lies under it. A running search keeps the pill (its workers stay adjustable).
 * CSS arbitrary breakpoints (sm:max-[1279px]:), so it is right from the first paint.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import SetupDock from './SetupDock.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { POS_WIDTH_SLACK, rememberedPos } from './setupDockPos';

const g = globalThis as { window?: unknown; localStorage?: unknown };
let had: unknown;
let hadLs: unknown;
const mem = new Map<string, string>();
beforeAll(() => {
  had = g.window;
  hadLs = g.localStorage;
  g.window = { innerWidth: 890, innerHeight: 800, location: { href: 'http://localhost/ascension-planner' }, addEventListener: () => {}, removeEventListener: () => {} };
  g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
});
afterAll(async () => {
  // A render with a search running starts the step-away run mark, which finishes after the test (it reads window.location.href);
  // let it finish before the fake window goes (PC gate-tv5, 17 Nov: unhandled rejection after teardown).
  await new Promise((r) => setTimeout(r, 200));
  g.window = had;
  g.localStorage = hadLs;
});
const dockTag = (html: string) => html.match(/<div[^>]*class="fixed z-50"[^>]*>/)?.[0] ?? '';
const classOf = (tag: string | undefined) => (tag ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
const pillTag = (html: string) => html.match(/<div[^>]*data-testid="setup-dock-pill"[^>]*>/)?.[0];
async function render(props: Record<string, unknown> = { screen: 'fastest' }, o: { searching?: boolean } = {}): Promise<string> {
  const p = createPinia();
  setActivePinia(p);
  if (o.searching) useChainSearchStore().isRunning = true;
  return renderHtml(SetupDock, props, {}, [p]);
}

describe('(a) a remembered position is forgotten when the window width has changed by more than 40 px', () => {
  it('the rule, pure', () => {
    expect(POS_WIDTH_SLACK).toBe(40);
    expect(rememberedPos('{"x":100,"y":300,"w":890}', 890)).toEqual({ x: 100, y: 300, w: 890 });
    expect(rememberedPos('{"x":100,"y":300,"w":890}', 930)).toEqual({ x: 100, y: 300, w: 890 });
    expect(rememberedPos('{"x":100,"y":300,"w":890}', 931)).toBeNull();
    expect(rememberedPos('{"x":100,"y":300,"w":1300}', 890)).toBeNull();
    // An entry from before the width was kept: forgotten once.
    expect(rememberedPos('{"x":100,"y":300}', 890)).toBeNull();
    expect(rememberedPos('nonsense', 890)).toBeNull();
    expect(rememberedPos(null, 890)).toBeNull();
  });
  it('rendered: a spot saved at this width is kept; one saved at another width gives the corner', async () => {
    mem.set('aap-setup-dock-pos', JSON.stringify({ x: 100, y: 300, w: 890 }));
    expect(dockTag(await render())).toContain('left:100px');
    mem.set('aap-setup-dock-pos', JSON.stringify({ x: 100, y: 300, w: 1500 }));
    expect(dockTag(await render())).toContain('right:1rem');
    mem.set('aap-setup-dock-pos', JSON.stringify({ x: 100, y: 300 }));
    expect(dockTag(await render())).toContain('right:1rem');
    mem.clear();
  });
  it('a saved spot carries the width it was saved at', () => {
    const src = readFileSync(new URL('./SetupDock.vue', import.meta.url), 'utf8');
    expect(src).toMatch(/JSON\.stringify\(\{ \.\.\.pos\.value, w: window\.innerWidth \}\)/);
  });
});

describe('(b) from sm to 1279 px the pill is the round gear, My runs included', () => {
  it('at rest: the pill is 48 px round and the gear fills it (the word and the handle are hidden), sm to 1279 px', async () => {
    const c = classOf(pillTag(await render()));
    expect(c).toEqual(expect.arrayContaining(['max-[1279px]:w-12', 'max-[1279px]:h-12', 'max-[1279px]:p-0', 'max-[1279px]:rounded-full']));
  });
  it('My runs (its summary): the round gear from sm to 1583 px (17 Nov 2026: the full pill covers the egg cards until the 1152 px column leaves it a margin), its summary line hidden there', async () => {
    const html = await render({ screen: 'fastest', summary: 'Awake 8:00 AM to 11:00 PM' });
    expect(classOf(pillTag(html))).toEqual(expect.arrayContaining(['sm:max-[1583px]:w-12', 'sm:max-[1583px]:h-12', 'sm:max-[1583px]:rounded-full']));
    expect(classOf(pillTag(html)).join(' ')).not.toContain('1279px');
    expect(html).toMatch(/data-testid="setup-dock-summary"[^>]*>/);
    expect(html.match(/<span[^>]*class="[^"]*sm:max-\[1583px\]:hidden[^"]*"[^>]*data-testid="setup-dock-summary"/) ?? html.match(/<span[^>]*data-testid="setup-dock-summary"[^>]*class="[^"]*sm:max-\[1583px\]:hidden/)).toBeTruthy();
  });
  it('a running search keeps the pill (its workers stay adjustable)', async () => {
    const c = classOf(pillTag(await render({ screen: 'fastest' }, { searching: true })));
    expect(c.join(' ')).not.toContain('max-[1279px]:w-12');
  });
  it("App.vue keeps a right margin for the gear on those widths, so no content lies under it", () => {
    const app = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8');
    expect(app).toMatch(/setupDockShown \? 'sm:max-\[1279px\]:pr-\[4\.5rem\]' : ''/);
  });
  it('the gear drags itself up to 1279 px (1583 on My runs), not only on a phone', () => {
    const src = readFileSync(new URL('./SetupDock.vue', import.meta.url), 'utf8');
    expect(src).toContain('(props.summary ? viewport.value.w >= 640 && viewport.value.w < ROUND_UNDER_MY_RUNS : viewport.value.w < ROUND_UNDER)');
    expect(src).toContain('const ROUND_UNDER = 1280;');
    expect(src).toContain('const ROUND_UNDER_MY_RUNS = 1584;');
  });
  it('the right margin rule stays at 1279: from 1280 px the 1152 px column leaves a 64 px margin, which holds the 48 px gear 16 px from the edge', () => {
    const app = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8');
    expect(app).toContain('From sm to 1279 px');
    expect(app).not.toContain('1583');
  });
});
