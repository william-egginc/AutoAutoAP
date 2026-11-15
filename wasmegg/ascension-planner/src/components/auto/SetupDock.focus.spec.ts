/**
 * Review W1 (15 Nov 2026): Setup took no focus on open and gave none back on close; its panel came BEFORE the pill in the page, so a
 * keyboard player tabbed past the pill into a panel that was not open to them; and the gear's red problem dot was silent to a screen
 * reader. The folded page header (and the Manual Planner's) kept invisible controls in the tab order.
 * No DOM here (node environment): the markup is rendered on the server, the focus code is pinned in the source.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import SetupDock from './SetupDock.vue';
import { useUIStore } from '@/stores/ui';

const g = globalThis as { window?: unknown };
let had: unknown;
beforeAll(() => {
  had = g.window;
  g.window = {
    innerWidth: 1280,
    innerHeight: 900,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost/ascension-planner/#/auto/fastest', hash: '#/auto/fastest', search: '', pathname: '/ascension-planner/', origin: 'http://localhost' },
  };
});
afterAll(() => {
  g.window = had;
});

async function render(o: { open?: boolean } = {}): Promise<string> {
  const p = createPinia();
  setActivePinia(p);
  if (o.open) useUIStore().setupOpen = true;
  return renderHtml(SetupDock, { screen: 'fastest' }, {}, [p]);
}

const vue = readFileSync(new URL('./SetupDock.vue', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8');

describe('the gear says there are problems with the save', () => {
  // `setupIssues` is a computed on the store, so a test cannot set it: a store with no save has one error, which is what shows.
  it('names them to a screen reader, keeping aria-label "Setup" and the dot', async () => {
    const html = await render();
    expect(html).toMatch(/<button[^>]*aria-label="Setup"[^>]*aria-describedby="setup-dock-problems"/);
    expect(html).toMatch(/<span id="setup-dock-problems" class="sr-only">1 problem with your save<\/span>/);
    expect(html).toMatch(/bg-rose-400[^>]*title="1 problem with your save" aria-hidden="true"/);
  });
  it('only when there are some: the description and its text are both behind the same count', () => {
    expect(vue).toContain(`:aria-describedby="errors ? 'setup-dock-problems' : undefined"`);
    expect(vue).toContain('<span v-if="errors" id="setup-dock-problems" class="sr-only">{{ problemsText }}</span>');
    expect(vue).toMatch(/`\$\{errors\.value\} problem\$\{errors\.value > 1 \? 's' : ''\} with your save`/);
  });
});

describe('the open panel follows the pill, so Tab goes pill, then panel', () => {
  it('in the page order (it is placed by CSS, so nothing moves on screen)', async () => {
    const html = await render({ open: true });
    expect(html.indexOf('data-testid="setup-dock-pill"')).toBeGreaterThan(0);
    expect(html.indexOf('role="dialog"')).toBeGreaterThan(html.indexOf('data-testid="setup-dock-pill"'));
  });
  it('is not modal: the pill and the page stay usable, so no aria-modal', async () => {
    expect(await render({ open: true })).not.toContain('aria-modal');
  });
});

describe('focus goes in on open and back to the gear on close', () => {
  it('opening puts focus in the panel unless something inside it already took it (a reveal)', () => {
    expect(vue).toMatch(/const doneBtn = ref<HTMLElement \| null>\(null\)/);
    expect(vue).toMatch(/ref="doneBtn"/);
    expect(vue).toMatch(/panel\.value\.contains\(document\.activeElement\)/);
    expect(vue).toMatch(/doneBtn\.value\?\.focus\(\)/);
  });
  it('closing gives focus back to the gear when it would otherwise be lost to the page', () => {
    expect(vue).toMatch(/const gearBtn = ref<HTMLElement \| null>\(null\)/);
    expect(vue).toMatch(/ref="gearBtn"/);
    expect(vue).toMatch(/document\.activeElement === document\.body/);
    expect(vue).toMatch(/gearBtn\.value\?\.focus\(\)/);
  });
});

describe('a folded header is out of the tab order', () => {
  it('both folded blocks (the page header and the Manual Planner\'s) are inert while folded', () => {
    expect(app.match(/:inert="isHeaderCollapsed"/g)?.length).toBe(2);
  });
});
