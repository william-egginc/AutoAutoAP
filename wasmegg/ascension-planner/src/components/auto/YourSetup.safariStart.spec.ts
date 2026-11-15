/**
 * Setup's line under the worker slider when Safari starts runs with fewer workers than the player chose
 * (lib/safariWorkers.ts, words lib/safariStartWords.ts, 15 Nov 2026): shown on Safari with 7 chosen on 8 cores,
 * absent in Chrome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { resetTabPrefsForTest } from '@/composables/useTabPrefs';
import { WORKERS_KEY } from '@/stores/chainSearch';
import YourSetup from './YourSetup.vue';

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

let mem: Map<string, string>;
let pinia: Pinia;
beforeEach(() => {
  mem = new Map<string, string>([[WORKERS_KEY, '7']]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTabPrefsForTest(null);
});

const render = (ua: string) => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, userAgent: ua });
  pinia = createPinia();
  setActivePinia(pinia);
  return renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
};

describe("Setup's Safari start line", () => {
  it('Safari, 7 chosen on 8 cores: the line is under the worker slider', async () => {
    const html = await render(SAFARI);
    const at = html.indexOf('data-testid="safari-start"');
    expect(at).toBeGreaterThan(0);
    const line = textOf(html.slice(html.lastIndexOf('<p', at), html.indexOf('</p>', at) + 4));
    expect(line).toContain('Safari starts runs with 5 workers, not the 7 you chose');
  });

  it('Chrome: no line', async () => {
    expect(await render(CHROME)).not.toContain('data-testid="safari-start"');
  });
});
