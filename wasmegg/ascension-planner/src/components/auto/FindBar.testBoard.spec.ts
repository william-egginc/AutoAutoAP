/**
 * The one-line note near Before you send on a build whose results go to their own board (VITE_BOARD_SUBMIT_URL,
 * lib/boardSubmitUrl.ts): shown only with the setting, never without it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import FindBar from './FindBar.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { reloadRunSends } from '@/lib/runSends';
import { TEST_BOARD_NOTE } from '@/lib/boardSubmitUrl';

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  vi.stubEnv('VITE_SUBMIT_URL', 'https://live-collector.test/submit');
  pinia = createPinia();
  setActivePinia(pinia);
  reloadRunSends();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const base = { findDisabled: false, running: false, optIn: false, anonymous: true, nickname: '' };
const html = () => renderHtml(FindBar, base, {}, [pinia]);

describe('FindBar: the test-board note', () => {
  it('is shown near Before you send when VITE_BOARD_SUBMIT_URL is set', async () => {
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', 'https://board-collector.test');
    const h = await html();
    expect(h).toContain('data-testid="test-board-note"');
    expect(textOf(h)).toContain(TEST_BOARD_NOTE);
    // Before the fold, so it shows with Before you send folded.
    expect(h.indexOf('test-board-note')).toBeLessThan(h.indexOf('Before you send</'));
  });

  it('is not shown without the setting', async () => {
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', '');
    const h = await html();
    expect(h).not.toContain('test-board-note');
    expect(textOf(h)).not.toContain('test board');
  });
});
