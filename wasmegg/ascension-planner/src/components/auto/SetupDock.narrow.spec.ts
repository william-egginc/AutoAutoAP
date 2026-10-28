/**
 * The floating Setup pill at 300 px (ux32-b, 28 Oct 2026): one row of drag handle, Setup, − 4/8 workers + is 297 px
 * wide, so 1rem from the right of a 300 px screen it started 13 px off the left edge and the drag handle was cut off
 * (measured in Playwright WebKit, iPhone 15; an iPhone reaches 300 CSS px with Safari's text size above 100%). It fit
 * at 393. Now the pill may wrap: the workers (−, the count, +) move together to a second row when the row does not
 * fit, the pill is never wider than the screen less 2rem, and its corners stay round on two rows. Below 320 px the
 * divider goes (it would end the first row) and the page leaves room for the taller pill. Tap targets stay 44 px.
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
  g.window = { innerWidth: 300, innerHeight: 852, addEventListener: () => {}, removeEventListener: () => {} };
});
afterAll(() => {
  g.window = had;
});

const classOf = (tag: string | undefined) => (tag ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
const pillTag = (html: string) => html.match(/<div[^>]*data-testid="setup-dock-pill"[^>]*>/)?.[0];

async function render(summary?: string): Promise<string> {
  const p = createPinia();
  setActivePinia(p);
  return renderHtml(SetupDock, summary ? { screen: 'fastest', summary } : { screen: 'fastest' }, {}, [p]);
}

describe('the Setup pill fits a 300 px screen, drag handle and all', () => {
  for (const [name, summary] of [
    ['the Auto Planner', undefined],
    ['My runs', '7 AM–11 PM · time off Oct 29–30'],
  ] as const) {
    it(`${name}: wraps rather than running off the left edge, never wider than the screen less 2rem`, async () => {
      const c = classOf(pillTag(await render(summary)));
      expect(c).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'justify-center', 'max-w-[calc(100vw-2rem)]']));
      // Round corners that still hold on two rows (a rounded-full pill two rows tall would cut its corners off).
      expect(c).toContain('rounded-[1.75rem]');
      expect(c).not.toContain('rounded-full');
    });

    it(`${name}: −, the count and + wrap together, the drag handle and Setup stay first`, async () => {
      const html = await render(summary);
      const at = html.indexOf('data-testid="setup-dock-workers"');
      expect(at).toBeGreaterThan(-1);
      expect(classOf(html.slice(html.lastIndexOf('<span', at), html.indexOf('>', at) + 1))).toEqual(
        expect.arrayContaining(['flex', 'items-center', 'gap-1'])
      );
      const inside = html.slice(at);
      for (const l of ['Fewer workers', 'More workers']) expect(inside).toContain(`aria-label="${l}"`);
      expect(inside).toMatch(/\d+\/\d+ workers/);
      expect(html.indexOf('Drag to move')).toBeLessThan(html.indexOf('aria-label="Setup"'));
      expect(html.indexOf('aria-label="Setup"')).toBeLessThan(at);
    });

    it(`${name}: the divider goes below 320 px; 44 px tap targets stay`, async () => {
      const html = await render(summary);
      const divider = html.match(/<span class="[^"]*\bw-px h-5 bg-white\/30\b[^"]*"/)?.[0];
      expect(classOf(divider)).toContain('max-[319px]:hidden');
      // − and + never shrink (at 342 px on My runs they were 34 px wide).
      expect((html.match(/w-11 h-11 sm:w-6 sm:h-6 shrink-0/g) ?? []).length).toBe(2);
      expect(html).toContain('min-h-[44px] sm:min-h-0 rounded-full px-2.5');
    });
  }

  it('My runs: Setup and its summary take what the row leaves, so the workers stay on it while Setup fits', async () => {
    const html = await render('7 AM–11 PM · time off Oct 29–30 · no prestige Oct 27');
    const setup = classOf(html.match(/<button[^>]*aria-label="Setup"[^>]*>/)?.[0]);
    expect(setup).toEqual(expect.arrayContaining(['basis-0', 'grow', 'xl:basis-auto', 'xl:grow-0']));
    // The gear keeps its 16 px when Setup is squeezed (at 342 px it shrank to about 10).
    expect(classOf(html.match(/<button[^>]*aria-label="Setup"[^>]*><svg[^>]*>/)?.[0].match(/<svg[^>]*>/)?.[0])).toEqual(
      expect.arrayContaining(['w-4', 'h-4', 'shrink-0'])
    );
    // Not on the Auto Planner, whose Setup is one word.
    expect(classOf((await render()).match(/<button[^>]*aria-label="Setup"[^>]*>/)?.[0])).not.toContain('basis-0');
  });

  it('My runs keeps its one row from xl (27rem, summary at 13rem)', async () => {
    const c = classOf(pillTag(await render('7 AM–11 PM · no time off')));
    expect(c).toEqual(expect.arrayContaining(['xl:flex-nowrap', 'xl:max-w-[27rem]', 'xl:rounded-2xl']));
  });

  it('the open panel stays on screen with larger text too (the pill is 1rem from the right, so 94vw passed the left edge)', async () => {
    const p = createPinia();
    setActivePinia(p);
    const { useUIStore } = await import('@/stores/ui');
    useUIStore().setupOpen = true;
    const html = await renderHtml(SetupDock, { screen: 'fastest' }, {}, [p]);
    const c = classOf(html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0]);
    expect(c).toContain('w-[min(94vw,calc(100vw-1rem-4px),46rem)]');
    // And still clips sideways (ux31-a).
    expect(c).toEqual(expect.arrayContaining(['overflow-y-auto', 'overflow-x-hidden']));
  });

  it('below 320 px the page leaves room for the second row (44 px and the 4 px gap, as 3rem)', () => {
    const app = readFileSync('src/App.vue', 'utf8');
    expect(app).toContain("const NARROW_PILL_ROOM = 'clamp(0px, (320px - 100vw) * 1000, 3rem)';");
    expect(app).toMatch(/pageBottomRoom = computed\(\(\) =>[\s\S]*?\$\{NARROW_PILL_ROOM\}[\s\S]*?\$\{NARROW_PILL_ROOM\}/);
    expect(3 * 16).toBeGreaterThanOrEqual(44 + 4);
  });
});
