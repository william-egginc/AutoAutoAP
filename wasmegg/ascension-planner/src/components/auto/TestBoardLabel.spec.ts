/** The Test board label (spec-betaboard, 16 Nov 2026): shown only when the build has its own board (VITE_BOARD_SUBMIT_URL). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import TestBoardLabel from './TestBoardLabel.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { TEST_BOARD_LABEL } from '@/lib/boardSubmitUrl';

let pinia: Pinia;
beforeEach(() => {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://live-collector.test/submit');
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => vi.unstubAllEnvs());

describe('TestBoardLabel', () => {
  it('says Test board with the setting', async () => {
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', 'https://board-collector.test');
    const h = await renderHtml(TestBoardLabel, {}, {}, [pinia]);
    expect(h).toContain('data-testid="test-board-label"');
    expect(textOf(h)).toBe(TEST_BOARD_LABEL);
  });
  it('is not there without it', async () => {
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', '');
    const h = await renderHtml(TestBoardLabel, {}, {}, [pinia]);
    expect(h).not.toContain('test-board-label');
  });
});
