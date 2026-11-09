/**
 * The pill's workers (− N/M workers +) only while a search runs (the simpler default page, Jordan 9 Nov 2026, Q4): at
 * rest the pill is Setup alone; a running search (Fast, Exact, Custom, By a date, a queue between its chains) shows the
 * workers so they can still be turned down mid-run (Jordan, 26 Oct 2026). Rendered on the server with a stand-in window.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import SetupDock from './SetupDock.vue';
import { renderHtml } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { WORKERS_TIP } from '@/lib/layoutWords';

const g = globalThis as { window?: unknown };
let had: unknown;
beforeEach(() => {
  had = g.window;
  g.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {}, removeEventListener: () => {} };
});
afterEach(() => {
  g.window = had;
});

describe('the workers on the Setup pill', () => {
  it('not at rest: the pill is Setup alone', async () => {
    const p = createPinia();
    setActivePinia(p);
    for (const props of [{ screen: 'fastest' }, { screen: 'fastest', summary: '8 AM–11 PM · no time off' }]) {
      const html = await renderHtml(SetupDock, props, {}, [p]);
      expect(html).toContain('>Setup</span>');
      expect(html).not.toContain('data-testid="setup-dock-workers"');
      expect(html).not.toMatch(/Fewer workers|More workers|\d+\/\d+ workers/);
    }
  });
  for (const [what, set] of [
    ['a Fast, Exact or Custom search', (s: ReturnType<typeof useChainSearchStore>) => (s.isRunning = true)],
    ['a By a date search', (s: ReturnType<typeof useChainSearchStore>) => (s.deadlineRunning = true)],
  ] as const)
    it(`while ${what} runs: − workers +, with what workers are`, async () => {
      const p = createPinia();
      setActivePinia(p);
      set(useChainSearchStore());
      const html = await renderHtml(SetupDock, { screen: 'fastest' }, {}, [p]);
      expect(html).toContain('data-testid="setup-dock-workers"');
      for (const w of ['Fewer workers', 'More workers']) expect(html).toContain(w);
      expect(html).toMatch(/\d+\/\d+ workers/);
      expect(html).toContain(WORKERS_TIP);
    });
});
