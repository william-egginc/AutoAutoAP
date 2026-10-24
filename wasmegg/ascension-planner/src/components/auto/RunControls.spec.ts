/** RunControls.vue (12 Oct): the order of the blocks, and Find greyed out for the other search. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { h } from 'vue';
import RunControls from './RunControls.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';

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
  pinia = createPinia();
  setActivePinia(pinia);
});

const props = {
  kind: 'smart',
  playerId: 'x',
  findDisabled: false,
  running: false,
  showSubmit: true,
  canCarryOn: false,
  report: { own: false },
  optIn: false,
  anonymous: true,
  nickname: '',
  note: '',
};
const render = (p: Record<string, unknown> = {}, slots = {}) =>
  renderHtml(RunControls, { ...props, ...p }, slots, [pinia]);

describe('RunControls', () => {
  it('puts the progress after the acknowledge box and Stepping away?', async () => {
    const html = await render({}, { progress: () => h('div', { 'data-testid': 'p' }, 'P') });
    const share = html.indexOf('data-testid="share-box"');
    const away = html.indexOf('Stepping away?');
    const progress = html.indexOf('data-testid="p"');
    expect(share).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(share);
    expect(progress).toBeGreaterThan(away);
  });

  describe('Find greyed out for the other search', () => {
    // A Smart search is going (no search space set): runProgress.kind is 'smart'.
    const smartRuns = () => {
      const store = useChainSearchStore();
      store.isRunning = true;
      expect(store.runProgress?.kind).toBe('smart');
    };
    it('Fastest\'s Exhaustive (full) names Nearby routes while it runs', async () => {
      smartRuns();
      const html = await render({ kind: 'full' });
      expect(html).toContain('data-testid="find-blocked"');
      expect(textOf(html)).toContain('Nearby routes is running');
      expect(html).toContain('data-testid="find-blocked-jump"');
    });
    it('the screen that is itself running says nothing', async () => {
      smartRuns();
      expect(await render({ kind: 'smart' })).not.toContain('find-blocked"');
    });
    it('By a date is never blocked this way', async () => {
      smartRuns();
      expect(await render({ kind: 'by-date' })).not.toContain('data-testid="find-blocked"');
    });
  });
});
