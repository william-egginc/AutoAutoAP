/** "When should I start?" in Science (#/science/start; moved from Fastest, 14 Oct 2026). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import StartTimeCard from './StartTimeCard.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { useStartTimesStore } from '@/stores/startTimes';

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('StartTimeCard (Science)', () => {
  it('a page of its own: heading, open (no fold), the anchor the links scroll to', async () => {
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('id="start-times"');
    expect(html).not.toContain('start-times-toggle');
    expect(textOf(html)).toMatch(/^When should I start\? For coming back after a break/);
  });

  it('without the instant answer on screen, offers the routes Fastest last listed for this target', async () => {
    const store = useChainSearchStore();
    useInstantSummaryStore().lastListed = { finalTE: store.finalTE, routes: [[205, 250, 490]] };
    const t = textOf(await renderHtml(StartTimeCard, {}, {}, [pinia]));
    expect(t).toContain("Instant answer's best: 205 250 490 (3 ascensions)");
    expect(t).not.toContain('Open Fastest');
  });

  it('not for another target, and says how to get routes when there are none', async () => {
    const store = useChainSearchStore();
    useInstantSummaryStore().lastListed = { finalTE: store.finalTE + 10, routes: [[205, 250, 490]] };
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('data-testid="start-times-empty"');
    expect(textOf(html)).not.toContain('205 250 490');
  });

  it('"Check start times for this route" asks for the page (App.vue answers) and picks that route', async () => {
    const st = useStartTimesStore();
    expect(st.asked).toBe(0);
    st.show([300, 490]);
    expect(st.asked).toBe(1);
    const t = textOf(await renderHtml(StartTimeCard, {}, {}, [pinia]));
    expect(t).toContain('This route: 300 490');
  });

  it('no save loaded: says so', async () => {
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('data-testid="start-times-no-save"');
  });
});
