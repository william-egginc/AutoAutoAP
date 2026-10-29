/**
 * The run page says when its phone link isn't updating (ux35-f, 28 Oct 2026): an amber note above the
 * Stepping away? fold, with the last time an update went, for the panel's own run only, gone once one goes.
 * Rendered on the server like the other component specs (no DOM).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import StepAwayOptions from './StepAwayOptions.vue';
import { activeWatch, resetWatchLink, type ActiveWatch } from '@/composables/useWatchLink';
import { clock12 } from '@/search/stepAway';

let mem: Map<string, string>;
let pinia: Pinia;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  resetWatchLink();
  vi.unstubAllGlobals();
});

const LAST_OK = Date.UTC(2026, 9, 27, 17, 5);
function watching(over: Partial<ActiveWatch>): void {
  activeWatch.value = {
    link: { id: 'A'.repeat(22), secret: 'B'.repeat(43), startedAt: LAST_OK - 3600_000 },
    kind: 'deadline',
    url: 'https://site.example/watch.html#x.y',
    status: 'running',
    lastTryAt: LAST_OK + 15 * 60_000,
    lastOkAt: LAST_OK,
    lastError: 'the collector said 503',
    fails: 3,
    lastNtfyAt: null,
    last: null,
    endedAt: null,
    ...over,
  };
}
async function render(kind: 'smart' | 'sweep' | 'deadline' = 'deadline'): Promise<string> {
  const app = createSSRApp({
    render: () => h(StepAwayOptions, { kind, playerId: '', canCarryOn: false, running: true }),
  });
  app.use(pinia);
  return renderToString(app);
}
const note = (html: string) =>
  html
    .match(/<p[^>]*data-testid="watch-phone-failing"[^>]*>([\s\S]*?)<\/p>/)?.[1]
    .replace(/\s+/g, ' ')
    .trim() ?? '';

describe('the phone link failing note', () => {
  it('shows after 3 failed updates in a row, amber, with the last one that went (12-hour time)', async () => {
    watching({});
    const html = await render();
    const tag = html.match(/<p[^>]*data-testid="watch-phone-failing"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('text-amber-800');
    expect(tag).toContain('role="status"');
    expect(note(html)).toBe(
      `Your phone link isn&#39;t updating: the last 3 updates didn&#39;t go (the collector said 503). The last one sent was at ${clock12(LAST_OK)}. It keeps trying every 5 minutes.`
    );
    expect(note(html)).toMatch(/\d{1,2}:\d{2} (am|pm)/);
    // Outside the fold, so it's in sight while the run goes.
    expect(html.indexOf('watch-phone-failing')).toBeLessThan(html.indexOf('fold-steppingAway'));
  });

  it('not before the third, not once one goes again, not after the run ended', async () => {
    watching({ fails: 2 });
    expect(note(await render())).toBe('');
    watching({ fails: 0, lastError: '' });
    expect(note(await render())).toBe('');
    watching({ status: 'finished', fails: 5 });
    expect(note(await render())).toBe('');
  });

  it('only on the panel whose run it is', async () => {
    watching({ kind: 'smart' });
    expect(note(await render('deadline'))).toBe('');
    expect(note(await render('smart'))).toContain('the last 3 updates didn&#39;t go');
  });
});
